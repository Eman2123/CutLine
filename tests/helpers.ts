import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { Cutline } from "../target/types/cutline";

export const SOL = LAMPORTS_PER_SOL;
export const bn = (n: number) => new anchor.BN(Math.round(n));

export function pdas(program: Program<Cutline>, owner: PublicKey, rootId: anchor.BN) {
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

export function delegPda(program: Program<Cutline>, root: PublicKey, delegate: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deleg"), root.toBuffer(), delegate.toBuffer()],
    program.programId
  )[0];
}

export function taskPda(program: Program<Cutline>, delegation: PublicKey, taskId: anchor.BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("task"), delegation.toBuffer(), taskId.toArrayLike(Buffer, "le", 8)],
    program.programId
  )[0];
}

export async function fund(provider: anchor.AnchorProvider, kp: PublicKey, sol = 1) {
  const sig = await provider.connection.requestAirdrop(kp, sol * SOL);
  await provider.connection.confirmTransaction(sig, "confirmed");
}

export function policy(opts: {
  perTx: number;
  budget: number;
  allowed: PublicKey[];
  canDelegate?: boolean;
  expiresAt?: number;
}) {
  const allowed = [...opts.allowed];
  while (allowed.length < 4) allowed.push(PublicKey.default);
  return {
    perTxLimit: bn(opts.perTx),
    budget: bn(opts.budget),
    allowed,
    allowedLen: opts.allowed.length,
    canDelegate: opts.canDelegate ?? false,
    expiresAt: bn(opts.expiresAt ?? Math.floor(Date.now() / 1000) + 3600),
  };
}

export async function expectErr(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e: any) {
    const got = e?.error?.errorCode?.code ?? String(e);
    assert.include(got, code, `expected ${code}, got ${got}`);
    return;
  }
  assert.fail(`expected ${code} but the tx succeeded`);
}

export const hash32 = () => Array.from(Keypair.generate().publicKey.toBytes());
