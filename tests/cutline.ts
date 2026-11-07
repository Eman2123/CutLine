import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { Cutline } from "../target/types/cutline";

describe("cutline: foundation (gate G1)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.cutline as Program<Cutline>;
  const owner = provider.wallet.publicKey;

  const rootId = new anchor.BN(Date.now() % 1_000_000);
  const budgetCap = new anchor.BN(2 * LAMPORTS_PER_SOL);

  const [rootPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("root"), owner.toBuffer(), rootId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), rootPda.toBuffer()],
    program.programId
  );

  async function expectErr(p: Promise<unknown>, code: string) {
    try {
      await p;
    } catch (e: any) {
      const got = e?.error?.errorCode?.code ?? String(e);
      assert.include(got, code, `expected ${code}, got ${got}`);
      return;
    }
    assert.fail(`expected ${code} but the tx succeeded`);
  }

  it("T1: owner initializes root (epoch 1, active)", async () => {
    await program.methods
      .initializeRoot(rootId, budgetCap)
      .accountsPartial({ owner, root: rootPda, vault: vaultPda })
      .rpc();

    const root = await program.account.rootAuthorization.fetch(rootPda);
    assert.equal(root.epoch.toNumber(), 1);
    assert.isTrue(root.active);
    assert.isTrue(root.owner.equals(owner));

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.budgetCap.toString(), budgetCap.toString());
    assert.equal(vault.spent.toNumber(), 0);
  });

  it("T2: owner deposits into vault (balance grows)", async () => {
    const before = await provider.connection.getBalance(vaultPda);
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    await program.methods
      .deposit(amount)
      .accountsPartial({ owner, root: rootPda, vault: vaultPda })
      .rpc();
    const after = await provider.connection.getBalance(vaultPda);
    assert.equal(after - before, amount.toNumber());
  });

  it("T8: a different wallet cannot revoke_root (UnauthorizedOwner)", async () => {
    const attacker = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      attacker.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    await expectErr(
      program.methods
        .revokeRoot()
        .accountsPartial({ owner: attacker.publicKey, root: rootPda })
        .signers([attacker])
        .rpc(),
      "UnauthorizedOwner"
    );
  });

  it("T9: owner revokes root (epoch 2, inactive)", async () => {
    await program.methods
      .revokeRoot()
      .accountsPartial({ owner, root: rootPda })
      .rpc();
    const root = await program.account.rootAuthorization.fetch(rootPda);
    assert.equal(root.epoch.toNumber(), 2);
    assert.isFalse(root.active);
  });

  it("T10: second revoke_root fails (RootAlreadyRevoked)", async () => {
    await expectErr(
      program.methods
        .revokeRoot()
        .accountsPartial({ owner, root: rootPda })
        .rpc(),
      "RootAlreadyRevoked"
    );
  });

  it("withdraw works after revoke", async () => {
    const before = await provider.connection.getBalance(vaultPda);
    await program.methods
      .withdraw()
      .accountsPartial({ owner, root: rootPda, vault: vaultPda })
      .rpc();
    const after = await provider.connection.getBalance(vaultPda);
    assert.isBelow(after, before);
  });
});
