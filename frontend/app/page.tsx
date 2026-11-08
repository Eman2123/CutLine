"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  PROGRAM_ID, Snapshot, explorerAddr, explorerTx, loadSnapshot, revokeRootIx, short, sol,
} from "@/lib/cutline";

const ENV_OWNER = process.env.NEXT_PUBLIC_ROOT_OWNER ?? "";
const ENV_ROOT_ID = process.env.NEXT_PUBLIC_ROOT_ID ?? "";

type Tone = "g" | "r" | "y" | "w" | "stale";
const Chip = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <span className={`cl-chip ${tone}`}>{children}</span>
);

const Svg = ({ children, size = 28, stroke = 3 }: { children: React.ReactNode; size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth={stroke} strokeLinecap="square" aria-hidden="true">
    {children}
  </svg>
);

function Stat({ bg, label, value, hint, icon }: { bg: string; label: string; value: React.ReactNode; hint: string; icon: React.ReactNode }) {
  return (
    <div className="cl-stat" style={{ background: bg }}>
      <div className="cl-stat-h"><span>{label}</span>{icon}</div>
      <div className="cl-stat-n">{value}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{hint}</div>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="cl-card">
      <div className="cl-card-h"><h2 className="cl-h2">{title}</h2>{right && <span>{right}</span>}</div>
      {children}
    </section>
  );
}

const Addr = ({ value }: { value: string }) => (
  <a className="mono" style={{ fontSize: 13, fontWeight: 700 }} href={explorerAddr(value)} target="_blank" rel="noopener noreferrer">
    {short(value)} ↗
  </a>
);

const fmtTime = (s: bigint) =>
  s <= BigInt(0) ? "—" : new Date(Number(s) * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

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
  const revokeBtn = useRef<HTMLButtonElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!modal) return;
    cancelBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) closeModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, busy]);

  function closeModal() { setModal(false); revokeBtn.current?.focus(); }

  const root = snap?.root ?? null;
  const isOwner = !!(publicKey && root && publicKey.equals(root.owner));
  const canRevoke = isOwner && !!root?.active;
  const revoked = !!root && !root.active;

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
  const delegations = useMemo(() => [...(snap?.delegations ?? [])].sort((a, b) => a.depth - b.depth), [snap]);
  const tasks = snap?.tasks ?? [];
  const isStale = (issued: bigint) => !!root && issued !== root.epoch;
  const validDelegations = root ? delegations.filter((d) => d.active && !isStale(d.issuedEpoch)).length : 0;
  const blockedTasks = root ? tasks.filter((t) => t.status === "Pending" && isStale(t.issuedEpoch)).length : 0;
  const runnableTasks = root ? tasks.filter((t) => t.status === "Pending" && !isStale(t.issuedEpoch)).length : 0;
  const executedTasks = tasks.filter((t) => t.status === "Executed").length;
  const notAllowed = (agent: PublicKey, recipient: PublicKey) => {
    const d = snap?.delegations.find((x) => x.delegate.equals(agent));
    return !!d && !d.allowed.some((a) => a.equals(recipient));
  };

  const revokeHint = !publicKey ? "CONNECT THE OWNER WALLET TO REVOKE"
    : !isOwner ? "ONLY THE ROOT OWNER CAN REVOKE"
    : root?.active ? "OWNER WALLET SIGNS IN PHANTOM" : "ALREADY REVOKED";

  return (
    <div>
      <div className="cl-ticker">
        SOLANA DEVNET // ONE WRITE KILLS THE WHOLE TREE // THE PROGRAM DECIDES, NOT THE AGENT // EPOCH CHECKED AT EVERY EXECUTION //
      </div>

      <header className="cl-header">
        <div className="cl-brand">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            <rect x="2" y="2" width="40" height="40" fill="#FFE14D" stroke="#0A0A0A" strokeWidth="4" />
            <rect x="12" y="12" width="20" height="20" fill="none" stroke="#0A0A0A" strokeWidth="4" />
            <path d="M8 36L36 8" stroke="#FF5A4D" strokeWidth="5" strokeDasharray="5 4" />
          </svg>
          CUTLINE
        </div>
        <div className="cl-row">
          <span className="cl-chip g" style={{ padding: "8px 14px", letterSpacing: ".06em" }}>DEVNET</span>
          <WalletMultiButton />
        </div>
      </header>

      <main className="cl-main" aria-live="polite">
        <section className="cl-hero">
          <div>
            <div className="cl-eyebrow">ROOT AUTHORIZATION</div>
            <div className="cl-row" style={{ gap: 20 }}>
              <h1 className="cl-h1">{root ? `ROOT #${root.rootId.toString().slice(-6)}` : "ROOT"}</h1>
              {root && (root.active
                ? <div className="cl-stamp g" style={{ transform: "rotate(-3deg)" }}>ACTIVE</div>
                : <div className="cl-stamp r" style={{ transform: "rotate(3deg)" }}>REVOKED</div>)}
            </div>
            <p className="cl-lead">
              Give the agent a policy, not your money. One transaction cuts the root, and every delegation and queued
              task under it stops passing the program&apos;s epoch check.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <button
              ref={revokeBtn}
              type="button"
              disabled={!canRevoke}
              onClick={() => setModal(true)}
              className="cl-btn cl-btn-big r"
            >
              <Svg><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 8.5L21 21M8.5 15.5L21 3" /></Svg>
              REVOKE ROOT
            </button>
            <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{revokeHint}</div>
          </div>
        </section>

        {error && <div role="alert" className="cl-error">{error}</div>}

        {revoked && root && (
          <section className="cl-banner">
            <div style={{ flex: "1 1 420px" }}>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
                ROOT REVOKED. EPOCH NOW {root.epoch.toString()}.
              </div>
              <div style={{ fontSize: 16 }}>
                Everything issued at an older epoch is stale and rejected on-chain. Nothing was deleted one by one.
              </div>
            </div>
            {lastSig && (
              <a className="mono" href={explorerTx(lastSig)} target="_blank" rel="noopener noreferrer"
                style={{ padding: "10px 16px", background: "var(--yellow)", border: "3px solid var(--ink)", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                VIEW TRANSACTION ↗
              </a>
            )}
          </section>
        )}

        <section className="cl-stats">
          <Stat bg="var(--yellow)" label="EPOCH" value={root ? root.epoch.toString() : "—"}
            hint={root ? (root.active ? "Current authorization version" : "Bumped by revoke") : "Waiting for root"}
            icon={<Svg><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M13 10l3 3" /></Svg>} />
          <Stat bg="var(--blue)" label="VAULT"
            value={<span style={{ fontSize: 44 }}>{snap?.vault ? sol(snap.vaultLamports) : "—"}<span style={{ fontSize: 18 }}> SOL</span></span>}
            hint={snap?.vault ? `${sol(snap.vault.spent)} of ${sol(snap.vault.budgetCap)} SOL budget spent` : "No vault yet"}
            icon={<Svg><rect x="3" y="4" width="18" height="16" /><circle cx="12" cy="12" r="3.5" /><path d="M12 8.5V7M12 17v-1.5M8.5 12H7M17 12h-1.5" /></Svg>} />
          <Stat bg="var(--green)" label="VALID DELEGATIONS" value={root ? validDelegations : "—"}
            hint={root ? (revoked ? `${delegations.length - validDelegations} are stale` : `${delegations.length - validDelegations} stale or inactive`) : ""}
            icon={<Svg><rect x="9" y="3" width="6" height="5" /><rect x="3" y="16" width="6" height="5" /><rect x="15" y="16" width="6" height="5" /><path d="M12 8v4M6 16v-4h12v4" /></Svg>} />
          <Stat bg="var(--white)" label="RUNNABLE TASKS" value={root ? runnableTasks : "—"}
            hint={root ? `${blockedTasks} blocked by stale epoch, ${executedTasks} executed` : ""}
            icon={<Svg><rect x="4" y="4" width="16" height="16" /><path d="M8 9l2 2 3-3M8 15l2 2 3-3M15 10h2M15 16h2" /></Svg>} />
        </section>

        <Card title="ROOT DETAILS">
          {!root ? (
            <div className="cl-empty">{snap ? "NO ROOT ACCOUNT FOUND FOR THIS OWNER AND ID." : target ? "LOADING ROOT FROM DEVNET…" : "SET A ROOT TO WATCH BELOW."}</div>
          ) : (
            <dl className="cl-dl">
              <div><dt>OWNER</dt><dd><Addr value={root.owner.toBase58()} /></dd></div>
              <div><dt>ROOT PDA</dt><dd><Addr value={snap!.rootAddress.toBase58()} /></dd></div>
              <div><dt>PROGRAM</dt><dd><Addr value={PROGRAM_ID.toBase58()} /></dd></div>
              <div><dt>VAULT PDA</dt><dd><Addr value={snap!.vaultAddress.toBase58()} /></dd></div>
              <div><dt>CREATED</dt><dd>{fmtTime(root.createdAt)}</dd></div>
              <div><dt>REVOKED</dt><dd>{root.active ? "—" : fmtTime(root.revokedAt)}</dd></div>
              {snap?.vault && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>BUDGET SPENT · {sol(snap.vault.spent)} / {sol(snap.vault.budgetCap)} SOL</dt>
                  <div className="cl-bar" style={{ marginTop: 8 }} role="progressbar" aria-label="Budget spent"
                    aria-valuenow={Math.round(Math.min(spentPct, 100))} aria-valuemin={0} aria-valuemax={100}>
                    <div style={{ width: `${Math.min(spentPct, 100)}%` }} />
                  </div>
                </div>
              )}
            </dl>
          )}
        </Card>

        <Card title="AUTHORIZATION TREE" right="EPOCH IS CHECKED AGAIN AT EVERY EXECUTION">
          {!root ? <div className="cl-empty">LOAD A ROOT TO SEE ITS TREE.</div> : (
            <>
              <div className="cl-line">
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>ROOT #{root.rootId.toString().slice(-6)}</div>
                  <div className="mono" style={{ fontSize: 12 }}>owner {short(root.owner)}</div>
                </div>
                <div className="cl-row">
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>EPOCH {root.epoch.toString()}</span>
                  {root.active ? <Chip tone="g">ACTIVE</Chip> : <Chip tone="r">REVOKED</Chip>}
                </div>
              </div>
              {!root.active && (
                <div className="cl-cut" aria-hidden="true"><i /><span>✂ CUT AT EPOCH {root.epoch.toString()}</span><i /></div>
              )}
              {delegations.length === 0 ? <div className="cl-empty">NO DELEGATIONS YET.</div> : delegations.map((d) => {
                const stale = !d.active || isStale(d.issuedEpoch);
                return (
                  <div key={d.address.toBase58()} className="cl-line" style={{ paddingLeft: 24 + Math.max(d.depth - 1, 0) * 48 }}>
                    <div className="cl-row" style={{ gap: 14, flexWrap: "nowrap" }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true" style={{ flex: "none" }}>
                        <rect x="4" y="8" width="16" height="11" /><path d="M12 4v4M9 13.5v1M15 13.5v1M2 13v3M22 13v3" />
                      </svg>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                          Agent <Addr value={d.delegate.toBase58()} />{" "}
                          <span className="mono" style={{ fontSize: 12, fontWeight: 400 }}>depth {d.depth}</span>
                        </div>
                        <div className="mono" style={{ fontSize: 12 }}>
                          {sol(d.perTxLimit)} SOL per tx · {sol(d.spent)} / {sol(d.budget)} SOL budget · {d.allowed.length} recipient{d.allowed.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    <div className="cl-row">
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>ISSUED EPOCH {d.issuedEpoch.toString()}</span>
                      {stale ? <Chip tone="stale">STALE</Chip> : <Chip tone="g">VALID</Chip>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </Card>

        <Card title="TASKS" right="EACH TASK REMEMBERS ITS ISSUE EPOCH">
          {tasks.length === 0 ? <div className="cl-empty">NO TASKS YET.</div> : (
            <div className="cl-scroll"><div className="cl-table">
              <div className="cl-cols head"><div>TASK</div><div>AGENT</div><div>RECIPIENT</div><div>AMOUNT</div><div>EPOCH</div><div>STATUS</div></div>
              {tasks.map((t) => {
                const stale = t.status === "Pending" && isStale(t.issuedEpoch);
                return (
                  <div key={t.address.toBase58()} className="cl-cols">
                    <div className="mono" style={{ fontSize: 14, fontWeight: 700 }}>#{t.taskId.toString().slice(-6)}</div>
                    <div style={{ fontWeight: 700 }}><Addr value={t.agent.toBase58()} /></div>
                    <div className="cl-row" style={{ gap: "4px 10px" }}>
                      <Addr value={t.recipient.toBase58()} />
                      {notAllowed(t.agent, t.recipient) && (
                        <span style={{ fontSize: 12, fontWeight: 700, background: "var(--red)", padding: "0 6px" }}>NOT ON ALLOWLIST</span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{sol(t.amount)} SOL</div>
                    <div className="mono" style={{ fontSize: 13 }}>
                      {t.issuedEpoch.toString()}{stale && root ? ` ≠ ${root.epoch.toString()}` : ""}
                    </div>
                    <div>
                      {t.status === "Executed" ? <Chip tone="g">EXECUTED</Chip>
                        : stale ? <Chip tone="stale">BLOCKED · STALE</Chip>
                        : t.status === "Cancelled" ? <Chip tone="w">CANCELLED</Chip>
                        : <Chip tone="w">PENDING</Chip>}
                    </div>
                  </div>
                );
              })}
            </div></div>
          )}
        </Card>

        <Card title="SECURITY AUDIT" right="NEWEST FIRST · REFRESHES EVERY 5S">
          {!snap || snap.audit.length === 0 ? <div className="cl-empty">NO TRANSACTIONS YET.</div> : snap.audit.map((a) => (
            <div key={a.signature} className="cl-audit">
              <div className="mono" style={{ flex: "0 0 84px", fontSize: 13, fontWeight: 700 }}>
                {a.time ? new Date(a.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
              </div>
              <div style={{ flex: "1 1 320px" }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{a.ok ? "Transaction confirmed" : a.error ?? "Transaction failed"}</div>
                {!a.ok && <div style={{ fontSize: 14 }}>Rejected by the program, error read from the failed transaction on-chain.</div>}
              </div>
              <div className="cl-row" style={{ gap: "10px 16px" }}>
                {a.ok ? <Chip tone="g">CONFIRMED</Chip> : <Chip tone="r">REJECTED ON-CHAIN</Chip>}
                <a className="mono" style={{ fontSize: 13, fontWeight: 700 }} href={explorerTx(a.signature)} target="_blank" rel="noopener noreferrer"
                  aria-label={`Open transaction ${a.signature} in Solana Explorer`}>
                  {a.signature.slice(0, 4)}…{a.signature.slice(-4)} ↗
                </a>
              </div>
            </div>
          ))}
        </Card>

        <details className="cl-card cl-details">
          <summary>ROOT TO WATCH</summary>
          <div style={{ padding: 24, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
              OWNER ADDRESS
              <input className="cl-input" value={ownerText} onChange={(e) => setOwnerText(e.target.value)} spellCheck={false} />
            </label>
            <label className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
              ROOT ID
              <input className="cl-input" value={rootIdText} onChange={(e) => setRootIdText(e.target.value)} spellCheck={false} />
            </label>
            {!target && (
              <p className="mono" style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, fontWeight: 700 }}>
                ENTER A VALID OWNER ADDRESS AND ROOT ID TO LOAD STATE FROM DEVNET.
              </p>
            )}
          </div>
        </details>

        <p className="cl-note">
          LIVE DATA FROM SOLANA DEVNET. THE OWNER KEY NEVER LEAVES YOUR WALLET, AND THE PROGRAM MAKES THE FINAL DECISION.
        </p>
      </main>

      {modal && root && snap && (
        <div className="cl-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) closeModal(); }}>
          <div className="cl-modal" role="dialog" aria-modal="true" aria-labelledby="revoke-title">
            <div style={{ padding: "16px 24px", background: "var(--red)", borderBottom: "4px solid var(--ink)" }}>
              <h2 id="revoke-title" className="cl-h2" style={{ fontSize: 28 }}>REVOKE THIS ROOT?</h2>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="cl-row">
                <span className="cl-chip w" style={{ padding: "6px 12px", fontSize: 14 }}>ROOT ID {root.rootId.toString().slice(-6)}</span>
                <span className="cl-chip y" style={{ padding: "6px 12px", fontSize: 14 }}>EPOCH {root.epoch.toString()} → {(root.epoch + BigInt(1)).toString()}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6, fontSize: 16 }}>
                <li>Bumps the root epoch and deactivates the root.</li>
                <li>Makes every delegation and task from the current epoch stale.</li>
                <li>Blocks stale tasks at the program, even if an agent still holds them.</li>
                <li>Cannot be undone; new authority needs a new root.</li>
              </ul>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                PHANTOM WILL ASK YOU TO SIGN. CONFIRMED TRANSACTIONS CANNOT BE UNDONE.
              </div>
              <div className="cl-row" style={{ justifyContent: "flex-end", gap: 14 }}>
                <button ref={cancelBtn} type="button" className="cl-btn cl-btn-sm w" onClick={closeModal} disabled={busy}>CANCEL</button>
                <button type="button" className="cl-btn cl-btn-sm r" style={{ boxShadow: "6px 6px 0 var(--ink)" }} onClick={confirmRevoke} disabled={busy}>
                  {busy ? "WAITING FOR PHANTOM…" : "CONFIRM REVOCATION"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
