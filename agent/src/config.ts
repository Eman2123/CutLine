import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

export const cfg = {
  rpc: process.env.RPC_URL ?? "https://api.devnet.solana.com",
  ownerKeypair: process.env.OWNER_KEYPAIR ?? "~/.config/solana/id.json",
  agentKeypair: process.env.AGENT_KEYPAIR ?? "./agent-keypair.json",
  rootOwner: process.env.ROOT_OWNER ?? "",
  rootId: process.env.ROOT_ID ?? "",
  allowedRecipient: process.env.ALLOWED_RECIPIENT ?? "",
  attacker: process.env.ATTACKER_ADDRESS ?? "",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.MODEL ?? "claude-sonnet-5-5",
  attackerMode: process.env.ATTACKER_MODE === "1",
};

export function need(name: keyof typeof cfg): string {
  const v = cfg[name];
  if (!v || typeof v !== "string") throw new Error(`Missing ${name} in agent/.env`);
  return v;
}
