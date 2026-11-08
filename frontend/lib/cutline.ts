import { Buffer } from "buffer";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "FDuzi1FjZ5hPK6VxbrKvm6oJ7rWLxMWqvrRMtnsxbiwu"
);
export const LAMPORTS = 1_000_000_000;

// Anchor discriminators (sha256("account:<Name>")[..8] / sha256("global:<ix>")[..8]).
const DISC = {
  root: [30, 171, 105, 138, 156, 250, 183, 200],
  vault: [211, 8, 232, 43, 2, 152, 117, 119],
  delegation: [237, 90, 140, 159, 124, 255, 243, 80],
  task: [79, 34, 229, 55, 88, 90, 55, 84],
  revokeRoot: [49, 224, 158, 25, 28, 155, 86, 209],
};

// Error codes follow the order in programs/cutline/src/errors.rs (Anchor starts at 6000).
const ERRORS = [
  "InvalidBudgetCap", "InvalidAmount", "UnauthorizedOwner", "UnauthorizedAgent",
  "RootAlreadyRevoked", "RootInactive", "EpochOverflow", "MathOverflow",
  "NothingToWithdraw", "InvalidRootReference", "StaleEpoch", "DelegationInvalid",
  "TaskNotPending", "RecipientMismatch", "PolicyViolation", "InsufficientVault",
  "InvalidPolicy", "CannotDelegate", "DepthExceeded",
];

export type Root = { owner: PublicKey; rootId: bigint; epoch: bigint; active: boolean; createdAt: bigint; revokedAt: bigint };
export type Vault = { root: PublicKey; budgetCap: bigint; spent: bigint };
export type Delegation = {
  address: PublicKey; delegate: PublicKey; depth: number; issuedEpoch: bigint;
  perTxLimit: bigint; budget: bigint; spent: bigint; allowed: PublicKey[];
  canDelegate: boolean; expiresAt: bigint; active: boolean;
};
export type TaskStatus = "Pending" | "Executed" | "Cancelled";
export type Task = {
  address: PublicKey; agent: PublicKey; taskId: bigint; issuedEpoch: bigint;
  recipient: PublicKey; amount: bigint; status: TaskStatus;
};
export type AuditRow = { signature: string; time: number | null; ok: boolean; error: string | null };

function u64(view: DataView, off: number) { return view.getBigUint64(off, true); }
function i64(view: DataView, off: number) { return view.getBigInt64(off, true); }
function key(data: Uint8Array, off: number) { return new PublicKey(data.slice(off, off + 32)); }
function view(data: Uint8Array) { return new DataView(data.buffer, data.byteOffset, data.byteLength); }

function leU64(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

export function rootPda(owner: PublicKey, rootId: bigint) {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("root"), owner.toBytes(), leU64(rootId)],
    PROGRAM_ID
  )[0];
}
export function vaultPda(root: PublicKey) {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("vault"), root.toBytes()], PROGRAM_ID)[0];
}

export function decodeRoot(d: Uint8Array): Root {
  const v = view(d);
  return {
    owner: key(d, 8), rootId: u64(v, 40), epoch: u64(v, 48),
    active: d[56] === 1, createdAt: i64(v, 57), revokedAt: i64(v, 65),
  };
}
export function decodeVault(d: Uint8Array): Vault {
  const v = view(d);
  return { root: key(d, 8), budgetCap: u64(v, 40), spent: u64(v, 48) };
}
export function decodeDelegation(address: PublicKey, d: Uint8Array): Delegation {
  const v = view(d);
  const allowedLen = d[8 + 32 * 3 + 1 + 8 * 4 + 128];
  const base = 8 + 32 * 3;
  const allowedStart = base + 1 + 8 * 4;
  const allowed: PublicKey[] = [];
  for (let i = 0; i < Math.min(allowedLen, 4); i++) allowed.push(key(d, allowedStart + 32 * i));
  const after = allowedStart + 128 + 1;
  return {
    address, delegate: key(d, 8 + 64), depth: d[base],
    issuedEpoch: u64(v, base + 1), perTxLimit: u64(v, base + 9), budget: u64(v, base + 17),
    spent: u64(v, base + 25), allowed, canDelegate: d[after] === 1,
    expiresAt: i64(v, after + 1), active: d[after + 9] === 1,
  };
}
export function decodeTask(address: PublicKey, d: Uint8Array): Task {
  const v = view(d);
  const statuses: TaskStatus[] = ["Pending", "Executed", "Cancelled"];
  return {
    address, agent: key(d, 8 + 64), taskId: u64(v, 8 + 96), issuedEpoch: u64(v, 8 + 104),
    recipient: key(d, 8 + 112), amount: u64(v, 8 + 144),
    status: statuses[d[8 + 144 + 8 + 32]] ?? "Pending",
  };
}

export type Snapshot = {
  rootAddress: PublicKey; vaultAddress: PublicKey;
  root: Root | null; vault: Vault | null; vaultLamports: number;
  delegations: Delegation[]; tasks: Task[]; audit: AuditRow[];
};

export async function loadSnapshot(conn: Connection, owner: PublicKey, rootId: bigint): Promise<Snapshot> {
  const rootAddress = rootPda(owner, rootId);
  const vaultAddress = vaultPda(rootAddress);
  const [rootAcc, vaultAcc] = await Promise.all([
    conn.getAccountInfo(rootAddress), conn.getAccountInfo(vaultAddress),
  ]);
  const filters = (disc: number[]) => [
    { memcmp: { offset: 0, bytes: bs58(disc) } },
    { memcmp: { offset: 8, bytes: rootAddress.toBase58() } },
  ];
  const [dels, tasks, sigs] = await Promise.all([
    conn.getProgramAccounts(PROGRAM_ID, { filters: filters(DISC.delegation) }),
    conn.getProgramAccounts(PROGRAM_ID, { filters: filters(DISC.task) }),
    conn.getSignaturesForAddress(rootAddress, { limit: 30 }),
  ]);
  return {
    rootAddress, vaultAddress,
    root: rootAcc ? decodeRoot(rootAcc.data) : null,
    vault: vaultAcc ? decodeVault(vaultAcc.data) : null,
    vaultLamports: vaultAcc?.lamports ?? 0,
    delegations: dels.map((a) => decodeDelegation(a.pubkey, a.account.data)),
    tasks: tasks.map((a) => decodeTask(a.pubkey, a.account.data))
      .sort((a, b) => (a.taskId < b.taskId ? 1 : -1)),
    audit: sigs.map((s) => ({
      signature: s.signature, time: s.blockTime ?? null, ok: !s.err, error: describeErr(s.err),
    })),
  };
}

function describeErr(err: unknown): string | null {
  if (!err) return null;
  const e = err as { InstructionError?: [number, { Custom?: number } | string] };
  const inner = e.InstructionError?.[1];
  if (inner && typeof inner === "object" && typeof inner.Custom === "number") {
    return ERRORS[inner.Custom - 6000] ?? `Custom(${inner.Custom})`;
  }
  return typeof inner === "string" ? inner : "TransactionError";
}

export function revokeRootIx(owner: PublicKey, root: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: root, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(DISC.revokeRoot),
  });
}

export const sol = (l: bigint | number) => (Number(l) / LAMPORTS).toLocaleString(undefined, { maximumFractionDigits: 4 });
export const short = (k: PublicKey | string) => { const s = typeof k === "string" ? k : k.toBase58(); return `${s.slice(0, 4)}…${s.slice(-4)}`; };
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

// Minimal base58 so the page needs no extra dependency.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58(bytes: number[]): string {
  let n = BigInt(0);
  for (const b of bytes) n = (n << BigInt(8)) | BigInt(b);
  let out = "";
  while (n > BigInt(0)) { out = ALPHABET[Number(n % BigInt(58))] + out; n /= BigInt(58); }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}
