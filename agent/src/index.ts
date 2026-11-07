/**
 * CutLine agent runtime.
 *
 *   npm run agent -- run invoices/normal.txt       LLM -> create_task -> execute_task
 *   npm run agent -- run invoices/malicious.txt    injection; program must reject
 *   npm run agent -- queue invoices/normal.txt     create_task only (task waits in queue)
 *   npm run agent -- drain                         re-read root, cancel locally if revoked,
 *                                                  still send execute_task (on-chain decides)
 */
import * as anchor from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { forcedMaliciousProposal } from "./attacker";
import { delegPda, explorer, getProgram, loadKeypair, rootPdas, sendLanding, taskPda } from "./chain";
import { cfg, need } from "./config";
import { proposePayment, Proposal } from "./llm";
import { logEvent } from "./log";
import { enqueue, loadQueue, saveQueue } from "./queue";

const agent = loadKeypair(cfg.agentKeypair);
const { program, conn } = getProgram(agent, cfg.rpc);
const rootId = new anchor.BN(need("rootId"));
const { root, vault } = rootPdas(program, new PublicKey(need("rootOwner")), rootId);
const deleg = delegPda(program, root, agent.publicKey);

function readInvoice(file: string) {
  return fs
    .readFileSync(path.resolve(file), "utf8")
    .replace(/\{ALLOWED_RECIPIENT\}/g, cfg.allowedRecipient)
    .replace(/\{ATTACKER_ADDRESS\}/g, cfg.attacker);
}

async function propose(invoice: string): Promise<Proposal> {
  if (cfg.attackerMode && invoice.includes("SYSTEM NOTICE")) {
    logEvent({ event: "attacker_mode", note: "forcing malicious tool call" });
    return forcedMaliciousProposal();
  }
  return proposePayment(invoice);
}

async function createTask(p: Proposal, invoice: string) {
  const taskId = new anchor.BN(Date.now());
  const task = taskPda(program, deleg, taskId);
  const lamports = Math.round(p.amountSol * LAMPORTS_PER_SOL);
  const taskHash = Array.from(
    createHash("sha256").update(invoice + p.recipient.toBase58() + lamports).digest()
  );

  const tx = await program.methods
    .createTask(taskId, p.recipient, new anchor.BN(lamports), taskHash)
    .accountsPartial({ agent: agent.publicKey, root, delegation: deleg, task })
    .transaction();
  const res = await sendLanding(conn, tx, agent);
  const r = await program.account.rootAuthorization.fetch(root);
  logEvent({
    event: "create_task",
    taskId: taskId.toString(),
    recipient: p.recipient.toBase58(),
    lamports,
    epoch: r.epoch.toNumber(),
    ok: res.ok,
    errorCode: res.errorCode,
    signature: res.signature,
    explorer: explorer(res.signature),
  });
  return { taskId, task, lamports, epoch: r.epoch.toNumber(), res };
}

async function executeOnChain(task: PublicKey, recipient: PublicKey) {
  const tx = await program.methods
    .executeTask()
    .accountsPartial({
      agent: agent.publicKey,
      root,
      vault,
      delegation: deleg,
      task,
      recipient,
    })
    .transaction();
  const res = await sendLanding(conn, tx, agent);
  logEvent({
    event: "execute_task",
    task: task.toBase58(),
    ok: res.ok,
    errorCode: res.errorCode,
    signature: res.signature,
    explorer: explorer(res.signature),
  });
  return res;
}

async function cmdRun(file: string) {
  const invoice = readInvoice(file);
  const p = await propose(invoice);
  logEvent({
    event: "proposal",
    recipient: p.recipient.toBase58(),
    amountSol: p.amountSol,
    memo: p.memo,
  });

  const created = await createTask(p, invoice);
  if (!created.res.ok) return;

  // Re-read root before executing. Best effort only; the program decides.
  const r = await program.account.rootAuthorization.fetch(root);
  if (!r.active || r.epoch.toNumber() !== created.epoch) {
    logEvent({ event: "local_cancel", reason: "root revoked or epoch changed" });
  }
  await executeOnChain(created.task, p.recipient);
}

async function cmdQueue(file: string) {
  const invoice = readInvoice(file);
  const p = await propose(invoice);
  const created = await createTask(p, invoice);
  if (!created.res.ok) return;
  enqueue({
    taskId: created.taskId.toString(),
    task: created.task.toBase58(),
    recipient: p.recipient.toBase58(),
    amountLamports: created.lamports,
    issuedEpoch: created.epoch,
    status: "pending",
  });
  logEvent({ event: "queued", task: created.task.toBase58() });
}

async function cmdDrain() {
  const q = loadQueue();
  for (const item of q.filter((i) => i.status === "pending")) {
    const r = await program.account.rootAuthorization.fetch(root);
    if (!r.active || r.epoch.toNumber() !== item.issuedEpoch) {
      item.status = "cancelled";
      logEvent({
        event: "local_cancel",
        task: item.task,
        taskEpoch: item.issuedEpoch,
        rootEpoch: r.epoch.toNumber(),
        note: "best-effort; sending anyway so the program's rejection is on-chain",
      });
    } else {
      item.status = "done";
    }
    await executeOnChain(new PublicKey(item.task), new PublicKey(item.recipient));
  }
  saveQueue(q);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "run" && arg) return cmdRun(arg);
  if (cmd === "queue" && arg) return cmdQueue(arg);
  if (cmd === "drain") return cmdDrain();
  console.log("usage: run <invoice> | queue <invoice> | drain");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
