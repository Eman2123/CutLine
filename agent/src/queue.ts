import * as fs from "fs";
import * as path from "path";

export type QueueItem = {
  taskId: string; // u64 as string
  task: string; // task PDA
  recipient: string;
  amountLamports: number;
  issuedEpoch: number;
  status: "pending" | "cancelled" | "done";
};

const file = path.join(__dirname, "../logs/queue.json");

export function loadQueue(): QueueItem[] {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

export function saveQueue(q: QueueItem[]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(q, null, 2));
}

export function enqueue(item: QueueItem) {
  const q = loadQueue();
  q.push(item);
  saveQueue(q);
}
