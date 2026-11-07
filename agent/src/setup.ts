/**
 * Demo bootstrap on devnet. Uses the owner CLI key for convenience; in the real demo
 * the owner actions (root, deposit, revoke) are signed in Phantom via the dashboard.
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import * as fs from "fs";
import { cfg } from "./config";
import { delegPda, expand, getProgram, loadKeypair, rootPdas } from "./chain";

async function main() {
  const owner = loadKeypair(cfg.ownerKeypair);
  const { program, conn } = getProgram(owner, cfg.rpc);

  // Agent key: create if missing.
  const agentPath = expand(cfg.agentKeypair);
  if (!fs.existsSync(agentPath)) {
    fs.writeFileSync(agentPath, JSON.stringify(Array.from(Keypair.generate().secretKey)));
    console.log("created", agentPath);
  }
  const agent = loadKeypair(cfg.agentKeypair);
  const allowed = Keypair.generate().publicKey;
  const attacker = Keypair.generate().publicKey;

  const rootId = new anchor.BN(Date.now() % 1_000_000_000);
  const { root, vault } = rootPdas(program, owner.publicKey, rootId);
  const deleg = delegPda(program, root, agent.publicKey);

  await program.methods
    .initializeRoot(rootId, new anchor.BN(2 * LAMPORTS_PER_SOL))
    .accountsPartial({ owner: owner.publicKey, root, vault })
    .rpc();
  await program.methods
    .deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
    .accountsPartial({ owner: owner.publicKey, root, vault })
    .rpc();

  const allowedList = [allowed, ...Array(3).fill(anchor.web3.PublicKey.default)];
  await program.methods
    .createDelegation(agent.publicKey, {
      perTxLimit: new anchor.BN(0.2 * LAMPORTS_PER_SOL),
      budget: new anchor.BN(1 * LAMPORTS_PER_SOL),
      allowed: allowedList,
      allowedLen: 1,
      canDelegate: false,
      expiresAt: new anchor.BN(Math.floor(Date.now() / 1000) + 24 * 3600),
    })
    .accountsPartial({
      signer: owner.publicKey,
      root,
      vault,
      parentDelegation: null,
      delegation: deleg,
    })
    .rpc();

  // Fee money for the agent (it holds no funds beyond fees).
  await conn.sendTransaction(
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: agent.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      })
    ),
    [owner]
  );

  console.log("\nAdd to agent/.env:");
  console.log(`ROOT_OWNER=${owner.publicKey.toBase58()}`);
  console.log(`ROOT_ID=${rootId.toString()}`);
  console.log(`ALLOWED_RECIPIENT=${allowed.toBase58()}`);
  console.log(`ATTACKER_ADDRESS=${attacker.toBase58()}`);
  console.log(`\nroot PDA ${root.toBase58()}\nvault ${vault.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
