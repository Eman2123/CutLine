"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PROGRAM_ID, Snapshot, explorerAddr, explorerTx, loadSnapshot, revokeRootIx, short, sol,
} from "@/lib/cutline";
import {
  IconAlert, IconArrowRight, IconBot, IconCheck, IconClock, IconExternal, IconHistory,
  IconKey, IconNetwork, IconRefresh, IconScissors, IconSettings, IconShield, IconShieldOff,
  IconTasks, IconVault, IconX, LogoMark,
} from "@/components/icons";

const ENV_OWNER = process.env.NEXT_PUBLIC_ROOT_OWNER ?? "";
const ENV_ROOT_ID = process.env.NEXT_PUBLIC_ROOT_ID ?? "";

type Tone = "green" | "red" | "amber" | "slate";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
};

function Badge({ tone, children, icon }: { tone: Tone; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

function Card({
  title, icon, right, children, className = "",
}: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</span>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

function Addr({ value }: { value: string }) {
  return (
    <a
      href={explorerAddr(value)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[13px] text-sky-700 hover:text-sky-900 hover:underline"
    >
      {short(value)}
      <IconExternal width={12} height={12} />
    </a>
  );
}

function Stat({
  label, value, hint, icon, tone = "slate",
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: React.ReactNode; tone?: Tone }) {
  const iconTone: Record<Tone, string> = {
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconTone[tone]}`}>{icon}</span>
      </div>
      <div className="mt-3 font-mono text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function fmtTime(seconds: bigint): string {
  if (seconds <= BigInt(0)) return "—";
  return new Date(Number(seconds) * 1000).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
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
  const canRevoke = isOwner && !!root?.active;

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

  const delegations = useMemo(
    () => [...(snap?.delegations ?? [])].sort((a, b) => a.depth - b.depth),
    [snap]
  );
  const validDelegations = root
    ? delegations.filter((d) => d.active && d.issuedEpoch === root.epoch).length : 0;
  const tasks = snap?.tasks ?? [];
  const blockedTasks = root
    ? tasks.filter((t) => t.status === "Pending" && t.issuedEpoch !== root.epoch).length : 0;
  const runnableTasks = root
    ? tasks.filter((t) => t.status === "Pending" && t.issuedEpoch === root.epoch).length : 0;

  const revokeHint = !publicKey
    ? "Connect the owner wallet to revoke"
    : !isOwner ? "Only the root owner can revoke"
    : root?.active ? "" : "Already revoked";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-[0.14em] text-slate-900">CUTLINE</div>
              <div className="text-xs text-slate-500">Revocable spend authority for AI agents</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Solana Devnet
            </span>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* Hero */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  {root ? `Root #${root.rootId.toString().slice(-6)}` : "Root authorization"}
                </h1>
                {root && (root.active
                  ? <Badge tone="green" icon={<span className="pulse-dot h-2 w-2 rounded-full bg-emerald-500" />}>ACTIVE</Badge>
                  : <Badge tone="red" icon={<IconShieldOff width={14} height={14} />}>REVOKED</Badge>)}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                Give the agent a policy, not your money. One transaction revokes the root, and every
                delegation and queued task under it stops passing the program&apos;s epoch check.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <button
                disabled={!canRevoke}
                onClick={() => setModal(true)}
                title={revokeHint}
                className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-rose-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
              >
                <IconScissors width={18} height={18} />
                Revoke Root
              </button>
              {revokeHint && <span className="text-xs text-slate-500">{revokeHint}</span>}
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <IconAlert className="mt-0.5 shrink-0" width={18} height={18} />
            <span className="break-words">{error}</span>
          </div>
        )}

        {root && !root.active && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-rose-600 ring-1 ring-rose-200">
                <IconShieldOff width={18} height={18} />
              </span>
              <div>
                <div className="font-semibold text-rose-900">
                  Root revoked. Epoch is now {root.epoch.toString()}.
                </div>
                <div className="mt-0.5 text-sm text-rose-800">
                  Everything issued at an older epoch is stale and rejected on-chain. Nothing had to be deleted one by one.
                </div>
              </div>
            </div>
            {lastSig && (
              <a
                href={explorerTx(lastSig)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
              >
                View transaction <IconExternal width={14} height={14} />
              </a>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Epoch"
            value={root ? root.epoch.toString() : "—"}
            hint={root ? (root.active ? "Current authorization version" : "Bumped by revoke") : "Waiting for root"}
            icon={<IconKey width={18} height={18} />}
            tone={root && !root.active ? "red" : "slate"}
          />
          <Stat
            label="Vault"
            value={<>{snap?.vault ? sol(snap.vaultLamports) : "—"}<span className="ml-1 text-base font-medium text-slate-500">SOL</span></>}
            hint={snap?.vault ? `${sol(snap.vault.spent)} of ${sol(snap.vault.budgetCap)} SOL budget spent` : "No vault yet"}
            icon={<IconVault width={18} height={18} />}
          />
          <Stat
            label="Valid delegations"
            value={root ? validDelegations : "—"}
            hint={root ? `${delegations.length - validDelegations} stale or inactive` : ""}
            icon={<IconNetwork width={18} height={18} />}
            tone={root && validDelegations > 0 ? "green" : "slate"}
          />
          <Stat
            label="Runnable tasks"
            value={root ? runnableTasks : "—"}
            hint={root ? `${blockedTasks} blocked by stale epoch` : ""}
            icon={<IconTasks width={18} height={18} />}
            tone={blockedTasks > 0 ? "amber" : "slate"}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Root details */}
          <Card title="Root details" icon={<IconShield width={18} height={18} />} className="lg:col-span-3">
            {!root ? (
              <Empty>{snap ? "No root account found for this owner and id." : "Loading root from devnet…"}</Empty>
            ) : (
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Owner</dt><dd className="mt-1"><Addr value={root.owner.toBase58()} /></dd></div>
                <div><dt className="text-xs text-slate-500">Root PDA</dt><dd className="mt-1"><Addr value={snap!.rootAddress.toBase58()} /></dd></div>
                <div><dt className="text-xs text-slate-500">Program</dt><dd className="mt-1"><Addr value={PROGRAM_ID.toBase58()} /></dd></div>
                <div><dt className="text-xs text-slate-500">Vault PDA</dt><dd className="mt-1"><Addr value={snap!.vaultAddress.toBase58()} /></dd></div>
                <div><dt className="text-xs text-slate-500">Created</dt><dd className="mt-1 text-slate-800">{fmtTime(root.createdAt)}</dd></div>
                <div><dt className="text-xs text-slate-500">Revoked</dt><dd className="mt-1 text-slate-800">{root.active ? "—" : fmtTime(root.revokedAt)}</dd></div>
              </dl>
            )}
          </Card>

          {/* Vault */}
          <Card title="Vault budget" icon={<IconVault width={18} height={18} />} className="lg:col-span-2">
            {!snap?.vault ? <Empty>No vault yet.</Empty> : (
              <div className="space-y-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Spent</div>
                    <div className="font-mono text-xl font-semibold text-slate-900">{sol(snap.vault.spent)} SOL</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Tree budget cap</div>
                    <div className="font-mono text-xl font-semibold text-slate-900">{sol(snap.vault.budgetCap)} SOL</div>
                  </div>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar"
                  aria-valuenow={Math.round(Math.min(spentPct, 100))} aria-valuemin={0} aria-valuemax={100} aria-label="Budget spent">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(spentPct, 100)}%` }} />
                </div>
                <p className="text-xs text-slate-500">
                  Agents spend through the program only. Revoke blocks them, and the owner can withdraw what is left.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Authorization tree */}
        <Card
          title="Authorization tree"
          icon={<IconNetwork width={18} height={18} />}
          right={<span className="text-xs text-slate-500">Epoch is checked again at every execution</span>}
        >
          {!root ? <Empty>Load a root to see its tree.</Empty> : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white"><IconKey width={18} height={18} /></span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Root owner</div>
                    <div className="font-mono text-xs text-slate-500">{short(root.owner)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-600">epoch {root.epoch.toString()}</span>
                  {root.active ? <Badge tone="green" icon={<IconCheck width={13} height={13} />}>ACTIVE</Badge>
                    : <Badge tone="red" icon={<IconX width={13} height={13} />}>REVOKED</Badge>}
                </div>
              </div>

              {!root.active && (
                <div className="flex items-center gap-3 px-2 py-1" aria-hidden="true">
                  <div className="h-px flex-1 border-t-2 border-dashed border-rose-300" />
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wide text-rose-600">
                    <IconScissors width={14} height={14} /> CUT AT EPOCH {root.epoch.toString()}
                  </span>
                  <div className="h-px flex-1 border-t-2 border-dashed border-rose-300" />
                </div>
              )}

              {delegations.length === 0 ? <Empty>No delegations yet.</Empty> : delegations.map((d) => {
                const stale = !d.active || d.issuedEpoch !== root.epoch;
                return (
                  <div key={d.address.toBase58()} style={{ marginLeft: Math.max(d.depth - 1, 0) * 24 }}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><IconBot width={18} height={18} /></span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                          Agent <Addr value={d.delegate.toBase58()} />
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">depth {d.depth}</span>
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500">
                          {sol(d.perTxLimit)} SOL per tx · {sol(d.spent)} / {sol(d.budget)} SOL · {d.allowed.length} recipient{d.allowed.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-600">issued epoch {d.issuedEpoch.toString()}</span>
                      {stale ? <Badge tone="amber" icon={<IconAlert width={13} height={13} />}>STALE</Badge>
                        : <Badge tone="green" icon={<IconCheck width={13} height={13} />}>VALID</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Tasks */}
        <Card title="Tasks" icon={<IconTasks width={18} height={18} />}
          right={<span className="text-xs text-slate-500">Each task remembers its issue epoch</span>}>
          {tasks.length === 0 ? <Empty>No tasks yet.</Empty> : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-3 font-medium">Task</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Recipient</th>
                    <th className="pb-3 font-medium">Epoch</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((t) => {
                    const stale = !!root && t.status === "Pending" && t.issuedEpoch !== root.epoch;
                    return (
                      <tr key={t.address.toBase58()}>
                        <td className="py-3 font-mono text-slate-700">#{t.taskId.toString().slice(-6)}</td>
                        <td className="py-3 font-mono text-slate-900">{sol(t.amount)} SOL</td>
                        <td className="py-3"><Addr value={t.recipient.toBase58()} /></td>
                        <td className="py-3 font-mono text-slate-700">
                          {t.issuedEpoch.toString()}
                          {stale && root && <span className="ml-1 text-rose-600">≠ {root.epoch.toString()}</span>}
                        </td>
                        <td className="py-3">
                          {t.status === "Executed" ? <Badge tone="green" icon={<IconCheck width={13} height={13} />}>Executed</Badge>
                            : stale ? <Badge tone="red" icon={<IconX width={13} height={13} />}>Blocked (stale epoch)</Badge>
                            : t.status === "Cancelled" ? <Badge tone="slate">Cancelled</Badge>
                            : <Badge tone="amber" icon={<IconClock width={13} height={13} />}>Pending</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Audit */}
        <Card
          title="Security audit"
          icon={<IconHistory width={18} height={18} />}
          right={<span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><IconRefresh width={13} height={13} />refreshes every 5s</span>}
        >
          {!snap || snap.audit.length === 0 ? <Empty>No transactions yet.</Empty> : (
            <ol className="relative space-y-1 border-l border-slate-200 pl-6">
              {snap.audit.map((a) => (
                <li key={a.signature} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <span className={`absolute -left-[34px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${a.ok ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                    {a.ok ? <IconCheck width={12} height={12} strokeWidth={3} /> : <IconX width={12} height={12} strokeWidth={3} />}
                  </span>
                  {a.ok
                    ? <Badge tone="green">Confirmed</Badge>
                    : <Badge tone="red">{a.error ?? "Failed"}</Badge>}
                  <a href={explorerTx(a.signature)} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[13px] text-sky-700 hover:text-sky-900 hover:underline">
                    {a.signature.slice(0, 10)}…{a.signature.slice(-6)}
                    <IconExternal width={12} height={12} />
                  </a>
                  <span className="text-xs text-slate-400">{a.time ? new Date(a.time * 1000).toLocaleTimeString() : ""}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Rejected attempts show the program&apos;s own error code, read from the failed transaction on-chain.
          </p>
        </Card>

        {/* Watch settings */}
        <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-slate-900">
            <span className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><IconSettings width={18} height={18} /></span>
              Root to watch
            </span>
            <IconArrowRight width={16} height={16} className="text-slate-400 transition group-open:rotate-90" />
          </summary>
          <div className="border-t border-slate-100 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">
                Owner address
                <input value={ownerText} onChange={(e) => setOwnerText(e.target.value)} spellCheck={false}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Root id
                <input value={rootIdText} onChange={(e) => setRootIdText(e.target.value)} spellCheck={false}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10" />
              </label>
            </div>
            {!target && (
              <p className="mt-3 flex items-center gap-2 text-xs text-amber-700">
                <IconAlert width={14} height={14} /> Enter a valid owner address and root id to load state from devnet.
              </p>
            )}
          </div>
        </details>

        <footer className="pb-6 text-center text-xs text-slate-500">
          Reads live accounts from Solana Devnet. The owner key never leaves your wallet, and the program makes the final decision.
        </footer>
      </main>

      {modal && root && snap && (
        <div role="dialog" aria-modal="true" aria-labelledby="revoke-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><IconScissors width={20} height={20} /></span>
              <h3 id="revoke-title" className="text-lg font-semibold text-slate-900">Revoke this root?</h3>
            </div>
            <dl className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Root id</dt><dd className="font-mono text-slate-900">{root.rootId.toString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Epoch</dt>
                <dd className="font-mono font-semibold text-rose-700">{root.epoch.toString()} → {(root.epoch + BigInt(1)).toString()}</dd></div>
            </dl>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              One transaction invalidates every delegation and every queued task under this root. This cannot be undone;
              new authority needs a new root.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setModal(false)} disabled={busy}
                className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmRevoke} disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
                {busy ? "Waiting for Phantom…" : "Confirm and sign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
