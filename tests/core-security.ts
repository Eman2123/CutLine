import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { Cutline } from "../target/types/cutline";
import { SOL, bn, delegPda, expectErr, fund, hash32, pdas, policy, taskPda } from "./helpers";

describe("cutline: core security (gate G2)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.cutline as Program<Cutline>;
  const owner = provider.wallet.publicKey;

  const rootId = bn((Date.now() % 1_000_000) + 1_000_000);
  const { root, vault } = pdas(program, owner, rootId);

  const agent = Keypair.generate();
  const allowed = Keypair.generate().publicKey;
  const stranger = Keypair.generate().publicKey;
  const deleg = delegPda(program, root, agent.publicKey);

  async function queue(id: number, recipient: PublicKey, lamports: number, who = agent, d = deleg) {
    const taskId = bn(id);
    const task = taskPda(program, d, taskId);
    await program.methods
      .createTask(taskId, recipient, bn(lamports), hash32())
      .accountsPartial({ agent: who.publicKey, root, delegation: d, task })
      .signers([who])
      .rpc();
    return task;
  }

  function exec(task: PublicKey, recipient: PublicKey, rootAcc = root, vaultAcc = vault) {
    return program.methods
      .executeTask()
      .accountsPartial({
        agent: agent.publicKey,
        root: rootAcc,
        vault: vaultAcc,
        delegation: deleg,
        task,
        recipient,
      })
      .signers([agent])
      .rpc();
  }

  before(async () => {
    await fund(provider, agent.publicKey, 1);

    await program.methods
      .initializeRoot(rootId, bn(2 * SOL))
      .accountsPartial({ owner, root, vault })
      .rpc();
    await program.methods
      .deposit(bn(1 * SOL))
      .accountsPartial({ owner, root, vault })
      .rpc();

    // limit 0.2 SOL per tx, budget 0.5 SOL, one allowed recipient
    await program.methods
      .createDelegation(
        agent.publicKey,
        policy({ perTx: 0.2 * SOL, budget: 0.5 * SOL, allowed: [allowed] })
      )
      .accountsPartial({
        signer: owner,
        root,
        vault,
        parentDelegation: null,
        delegation: deleg,
      })
      .rpc();
  });

  let t3Task: PublicKey;

  it("T3: allowed recipient, within limit -> Executed", async () => {
    t3Task = await queue(1, allowed, 0.1 * SOL);
    const before = await provider.connection.getBalance(allowed);
    await exec(t3Task, allowed);
    const after = await provider.connection.getBalance(allowed);
    assert.equal(after - before, 0.1 * SOL);

    const t = await program.account.task.fetch(t3Task);
    assert.property(t.status, "executed");
    const d = await program.account.delegation.fetch(deleg);
    assert.equal(d.spent.toNumber(), 0.1 * SOL);
  });

  it("T4: recipient outside allowlist -> PolicyViolation", async () => {
    const t = await queue(2, stranger, 0.05 * SOL);
    await expectErr(exec(t, stranger), "PolicyViolation");
  });

  it("T5: amount above per-tx limit -> PolicyViolation", async () => {
    const t = await queue(3, allowed, 0.3 * SOL);
    await expectErr(exec(t, allowed), "PolicyViolation");
  });

  it("T6: delegation budget exhausted -> PolicyViolation", async () => {
    // spent so far 0.1; two more 0.2 -> 0.5 (budget exactly used)
    await exec(await queue(4, allowed, 0.2 * SOL), allowed);
    await exec(await queue(5, allowed, 0.2 * SOL), allowed);
    const over = await queue(6, allowed, 0.1 * SOL);
    await expectErr(exec(over, allowed), "PolicyViolation");
  });

  it("T7: executing the same task twice -> TaskNotPending", async () => {
    await expectErr(exec(t3Task, allowed), "TaskNotPending");
  });

  it("T12: expired delegation cannot create_task -> DelegationInvalid", async () => {
    const shortAgent = Keypair.generate();
    await fund(provider, shortAgent.publicKey, 1);
    const d = delegPda(program, root, shortAgent.publicKey);
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .createDelegation(
        shortAgent.publicKey,
        policy({ perTx: 0.1 * SOL, budget: 0.1 * SOL, allowed: [allowed], expiresAt: now + 3 })
      )
      .accountsPartial({ signer: owner, root, vault, parentDelegation: null, delegation: d })
      .rpc();

    await new Promise((r) => setTimeout(r, 5000));
    await expectErr(queue(1, allowed, 0.01 * SOL, shortAgent, d), "DelegationInvalid");
  });

  it("T13: child policy wider than parent -> PolicyViolation", async () => {
    const parentAgent = Keypair.generate();
    const childAgent = Keypair.generate();
    await fund(provider, parentAgent.publicKey, 1);
    const parentD = delegPda(program, root, parentAgent.publicKey);
    const childD = delegPda(program, root, childAgent.publicKey);

    await program.methods
      .createDelegation(
        parentAgent.publicKey,
        policy({ perTx: 0.1 * SOL, budget: 0.3 * SOL, allowed: [allowed], canDelegate: true })
      )
      .accountsPartial({ signer: owner, root, vault, parentDelegation: null, delegation: parentD })
      .rpc();

    await expectErr(
      program.methods
        .createDelegation(
          childAgent.publicKey,
          policy({ perTx: 0.1 * SOL, budget: 0.6 * SOL, allowed: [allowed] }) // budget > parent's
        )
        .accountsPartial({
          signer: parentAgent.publicKey,
          root,
          vault,
          parentDelegation: parentD,
          delegation: childD,
        })
        .signers([parentAgent])
        .rpc(),
      "PolicyViolation"
    );
  });

  it("T14: task executed against the wrong root -> InvalidRootReference", async () => {
    const otherId = bn((Date.now() % 1_000_000) + 2_000_000);
    const other = pdas(program, owner, otherId);
    await program.methods
      .initializeRoot(otherId, bn(1 * SOL))
      .accountsPartial({ owner, root: other.root, vault: other.vault })
      .rpc();

    // fresh budget on the real delegation is gone, so any task works for this check
    const t = await queue(7, allowed, 0.01 * SOL);
    await expectErr(exec(t, allowed, other.root, other.vault), "InvalidRootReference");
  });

  it("T11: task queued before revoke fails after revoke -> StaleEpoch", async () => {
    // Fresh agent so budget is not the reason for failure.
    const b = Keypair.generate();
    await fund(provider, b.publicKey, 1);
    const bDeleg = delegPda(program, root, b.publicKey);
    await program.methods
      .createDelegation(
        b.publicKey,
        policy({ perTx: 0.1 * SOL, budget: 0.2 * SOL, allowed: [allowed] })
      )
      .accountsPartial({ signer: owner, root, vault, parentDelegation: null, delegation: bDeleg })
      .rpc();
    const task = await queue(1, allowed, 0.05 * SOL, b, bDeleg);

    await program.methods.revokeRoot().accountsPartial({ owner, root }).rpc();

    const r = await program.account.rootAuthorization.fetch(root);
    assert.equal(r.epoch.toNumber(), 2);
    const t = await program.account.task.fetch(task);
    assert.equal(t.issuedEpoch.toNumber(), 1);

    await expectErr(
      program.methods
        .executeTask()
        .accountsPartial({
          agent: b.publicKey,
          root,
          vault,
          delegation: bDeleg,
          task,
          recipient: allowed,
        })
        .signers([b])
        .rpc(),
      "StaleEpoch"
    );
  });
});
