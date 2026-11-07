import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { assert } from "chai";
import { Cutline } from "../target/types/cutline";
import { SOL, bn, delegPda, fund, hash32, pdas, policy, taskPda } from "./helpers";

// Race: execute_task and revoke_root sent at the same time. Solana orders them;
// both outcomes are correct and are documented.
describe("cutline: race (execute vs revoke)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.cutline as Program<Cutline>;
  const owner = provider.wallet.publicKey;

  it("either execute lands first (valid, bounded) or revoke does (StaleEpoch)", async () => {
    const rootId = bn((Date.now() % 1_000_000) + 3_000_000);
    const { root, vault } = pdas(program, owner, rootId);
    const agent = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    await fund(provider, agent.publicKey, 1);

    await program.methods.initializeRoot(rootId, bn(1 * SOL)).accountsPartial({ owner, root, vault }).rpc();
    await program.methods.deposit(bn(0.5 * SOL)).accountsPartial({ owner, root, vault }).rpc();

    const deleg = delegPda(program, root, agent.publicKey);
    await program.methods
      .createDelegation(agent.publicKey, policy({ perTx: 0.1 * SOL, budget: 0.2 * SOL, allowed: [recipient] }))
      .accountsPartial({ signer: owner, root, vault, parentDelegation: null, delegation: deleg })
      .rpc();

    const taskId = bn(1);
    const task = taskPda(program, deleg, taskId);
    await program.methods
      .createTask(taskId, recipient, bn(0.05 * SOL), hash32())
      .accountsPartial({ agent: agent.publicKey, root, delegation: deleg, task })
      .signers([agent])
      .rpc();

    const exec = program.methods
      .executeTask()
      .accountsPartial({ agent: agent.publicKey, root, vault, delegation: deleg, task, recipient })
      .signers([agent])
      .rpc();
    const revoke = program.methods.revokeRoot().accountsPartial({ owner, root }).rpc();

    const [e, r] = await Promise.allSettled([exec, revoke]);
    assert.equal(r.status, "fulfilled", "revoke must always succeed");

    const t = await program.account.task.fetch(task);
    if (e.status === "fulfilled") {
      assert.property(t.status, "executed"); // executed before revoke: valid, loss <= budget
    } else {
      assert.property(t.status, "pending"); // revoke won: execute rejected
    }
    console.log("      outcome:", e.status === "fulfilled" ? "execute first" : "revoke first");
  });
});
