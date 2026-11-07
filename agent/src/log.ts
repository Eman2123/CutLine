import * as fs from "fs";
import * as path from "path";

const file = path.join(__dirname, "../logs/audit.jsonl");

export function logEvent(e: Record<string, unknown>) {
  const row = { ts: new Date().toISOString(), ...e };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
}
