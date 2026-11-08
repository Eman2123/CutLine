"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Snapshot, explorerAddr, explorerTx, loadSnapshot, revokeRootIx, short, sol,
} from "@/lib/cutline";

const ENV_OWNER = process.env.NEXT_PUBLIC_ROOT_OWNER ?? "";
const ENV_ROOT_ID = process.env.NEXT_PUBLIC_ROOT_ID ?? "";

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Badge({ tone, children }: { tone: "green" | "red" | "amber" | "gray"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    gray: "bg-white/10 text-white/70 border-white/15",
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function Addr({ value }: { value: string }) {
  return (
    <a href={explorerAddr(value)} target="_blank" rel="noreferrer" className="font-mono text-sky-300 hover:underline">
      {short(value)}
    </a>
  );
}

export default function Page() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [ownerText, setOwnerText] = useState(ENV_OWNER);
  const [rootIdText, setRootIdText] = useState(ENV_ROOT_ID);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const target = useMemo(() => {
    try {
      if (!ownerText || !rootIdText) return null;
      return { owner: new PublicKey(ownerText.trim()), rootId: BigInt(rootIdText.trim()) };
    } catch {
      return null;
    }
  }, [ownerText, rootIdText]);

  const refresh = useCallback(async () => {
    if (!target) return;
    try {
      setSnap(await loadSnapshot(connection, target.owner, target.rootId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [connection, target]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const root = snap?.root ?? null;
  const isOwner = !!(publicKey && root && publicKey.equals(root.owner));
  const canRevoke = isOwner && root?.active;

  async function confirmRevoke() {
    if (!publicKey || !snap || !root) return;
    setBusy(true);
    setError(null);
    try {
      const tx = new Transaction().add(revokeRootIx(publicKey, snap.rootAddress));
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setLastSig(sig);
      setModal(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const spentPct = snap?.vault && snap.vault.budgetCap > BigInt(0)
    ? Number((snap.vault.spent * BigInt(10000)) / snap.vault.budgetCap) / 100 : 0;

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CutLine</h1>
          <p className="text-sm text-white/60">Give the agent a policy, not your money. One transaction cuts the whole tree.</p>
        </div>
        <WalletMultiButton />
      </header>

      <Panel title="Root to watch">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-white/60">
            Owner address
            <input value={ownerText} onChange={(e) => setOwnerText(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white" />
          </label>
          <label className="text-xs text-white/60">
            Root id
            <input value={rootIdText} onChange={(e) => setRootIdText(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white" />
          </label>
        </div>
        {!target && <p className="mt-3 text-xs text-amber-300">Enter a valid owner address and root id to load state from devnet.</p>}
      </Panel>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

      <Panel
        title="Root status"
        right={
          <button
            disabled={!canRevoke}
            onClick={() => setModal(true)}
            title={!publicKey ? "Connect the owner wallet" : !isOwner ? "Only the root owner can revoke" : root?.active ? "" : "Already revoked"}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Revoke Root
          </button>
        }
      >
        {!root ? (
          <p className="text-sm text-white/60">{snap ? "No root account found for this owner and id." : "Loading…"}</p>
        ) : (
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-white/50">State</div>
              <div className="mt-1">{root.active ? <Badge tone="green">ACTIVE</Badge> : <Badge tone="red">REVOKED</Badge>}</div></div>
            <div><div className="text-xs text-white/50">Epoch</div><div className="mt-1 font-mono text-lg">{root.epoch.toString()}</div></div>
            <div><div className="text-xs text-white/50">Owner</div><div className="mt-1"><Addr value={root.owner.toBase58()} /></div></div>
            <div><div className="text-xs text-white/50">Root PDA</div><div className="mt-1"><Addr value={snap!.rootAddress.toBase58()} /></div></div>
          </div>
        )}
        {lastSig && (
          <p className="mt-3 text-sm text-emerald-300">
            Revoked. <a className="underline" target="_blank" rel="noreferrer" href={explorerTx(lastSig)}>View transaction</a>
          </p>
        )}
      </Panel>

      <Panel title="Vault">
        {!snap?.vault ? <p className="text-sm text-white/60">No vault yet.</p> : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-6">
              <div><div className="text-xs text-white/50">Balance</div><div className="font-mono text-lg">{sol(snap.vaultLamports)} SOL</div></div>
              <div><div className="text-xs text-white/50">Spent / budget cap</div>
                <div className="font-mono text-lg">{sol(snap.vault.spent)} / {sol(snap.vault.budgetCap)} SOL</div></div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-sky-400" style={{ width: `${Math.min(spentPct, 100)}%` }} />
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Delegations">
        {!snap || snap.delegations.length === 0 ? <p className="text-sm text-white/60">No delegations.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-white/50"><tr>
                <th className="pb-2">Agent</th><th>Per-tx limit</th><th>Spent / budget</th><th>Allowed</th><th>Issued epoch</th><th>Status</th>
              </tr></thead>
              <tbody>
                {snap.delegations.map((d) => {
                  const stale = !!root && d.issuedEpoch !== root.epoch;
                  return (
                    <tr key={d.address.toBase58()} className="border-t border-white/5">
                      <td className="py-2"><Addr value={d.delegate.toBase58()} /></td>
                      <td className="font-mono">{sol(d.perTxLimit)}</td>
                      <td className="font-mono">{sol(d.spent)} / {sol(d.budget)}</td>
                      <td>{d.allowed.map((a) => <span key={a.toBase58()} className="mr-2"><Addr value={a.toBase58()} /></span>)}</td>
                      <td className="font-mono">{d.issuedEpoch.toString()}</td>
                      <td>{stale || !d.active ? <Badge tone="red">Stale</Badge> : <Badge tone="green">Valid</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Tasks">
        {!snap || snap.tasks.length === 0 ? <p className="text-sm text-white/60">No tasks.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-white/50"><tr>
                <th className="pb-2">Task</th><th>Amount</th><th>Recipient</th><th>Issued epoch</th><th>Status</th>
              </tr></thead>
              <tbody>
                {snap.tasks.map((t) => {
                  const stale = !!root && t.status === "Pending" && t.issuedEpoch !== root.epoch;
                  return (
                    <tr key={t.address.toBase58()} className="border-t border-white/5">
                      <td className="py-2 font-mono text-white/70">{t.taskId.toString().slice(-6)}</td>
                      <td className="font-mono">{sol(t.amount)} SOL</td>
                      <td><Addr value={t.recipient.toBase58()} /></td>
                      <td className="font-mono">{t.issuedEpoch.toString()}</td>
                      <td>
                        {t.status === "Executed" ? <Badge tone="green">Executed</Badge>
                          : stale ? <Badge tone="red">Blocked (stale epoch)</Badge>
                          : <Badge tone="amber">Pending</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Audit log" right={<span className="text-xs text-white/40">refreshes every 5s</span>}>
        {!snap || snap.audit.length === 0 ? <p className="text-sm text-white/60">No transactions yet.</p> : (
          <ul className="space-y-2 text-sm">
            {snap.audit.map((a) => (
              <li key={a.signature} className="flex flex-wrap items-center gap-3">
                {a.ok ? <Badge tone="green">Success</Badge> : <Badge tone="red">{a.error ?? "Failed"}</Badge>}
                <a href={explorerTx(a.signature)} target="_blank" rel="noreferrer" className="font-mono text-sky-300 hover:underline">
                  {a.signature.slice(0, 10)}…{a.signature.slice(-6)}
                </a>
                <span className="text-xs text-white/40">{a.time ? new Date(a.time * 1000).toLocaleTimeString() : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-white/40">
          Rejected attempts show the program&apos;s own error code, read from the failed transaction on-chain.
        </p>
      </Panel>

      {modal && root && snap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#12151c] p-6">
            <h3 className="text-lg font-semibold">Revoke this root?</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-white/50">Root id</dt><dd className="font-mono">{root.rootId.toString()}</dd></div>
              <div className="flex justify-between"><dt className="text-white/50">Current epoch</dt><dd className="font-mono">{root.epoch.toString()} → {(root.epoch + BigInt(1)).toString()}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-white/70">
              One transaction invalidates every delegation and every queued task under this root. This cannot be undone;
              new authority needs a new root.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setModal(false)} disabled={busy}
                className="rounded-md border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Cancel</button>
              <button onClick={confirmRevoke} disabled={busy}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-50">
                {busy ? "Waiting for Phantom…" : "Confirm and sign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
