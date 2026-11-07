import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Cutline } from "../../target/types/cutline";

export function expand(p: string) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : path.resolve(p);
}

export function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(expand(p), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function getProgram(signer: Keypair, rpc: string) {
  const conn = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(signer), {
    commitment: "confirmed",
  });
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../target/idl/cutline.json"), "utf8")
  );
  const program = new Program<Cutline>(idl, provider);
  return { program, conn };
}

export function rootPdas(program: Program<Cutline>, owner: PublicKey, rootId: anchor.BN) {
  const [root] = PublicKey.findProgramAddressSync(
    [Buffer.from("root"), owner.toBuffer(), rootId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), root.toBuffer()],
    program.programId
  );
  return { root, vault };
}

export const delegPda = (program: Program<Cutline>, root: PublicKey, agent: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("deleg"), root.toBuffer(), agent.toBuffer()],
    program.programId
  )[0];

export const taskPda = (program: Program<Cutline>, deleg: PublicKey, id: anchor.BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("task"), deleg.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    program.programId
  )[0];

export type SendResult = {
  signature: string;
  ok: boolean;
  errorCode?: string;
  logs?: string[];
};

/**
 * Sends with skipPreflight so a rejected tx still lands on-chain with a signature
 * and program logs, which is the proof shown in the Explorer.
 */
export async function sendLanding(
  conn: Connection,
  tx: anchor.web3.Transaction,
  signer: Keypair
): Promise<SendResult> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(signer);

  const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const res = await conn.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  if (!res.value.err) return { signature, ok: true };

  const full = await conn.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const logs = full?.meta?.logMessages ?? [];
  const m = logs.join("\n").match(/Error Code: (\w+)/);
  return { signature, ok: false, errorCode: m?.[1], logs };
}

export const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
