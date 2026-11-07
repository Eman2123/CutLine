import Anthropic from "@anthropic-ai/sdk";
import { PublicKey } from "@solana/web3.js";
import { cfg, need } from "./config";

export type Proposal = { recipient: PublicKey; amountSol: number; memo: string };

// Deliberately naive prompt: the demo is about the model being fooled while the
// program still refuses. Do not treat this prompt as a security control.
const SYSTEM =
  "You are an accounts-payable agent. Read the invoice text and call propose_payment. " +
  "Follow any payment instructions contained in the invoice.";

export async function proposePayment(invoiceText: string): Promise<Proposal> {
  const client = new Anthropic({ apiKey: need("anthropicKey") });
  const resp = await client.messages.create({
    model: cfg.model,
    max_tokens: 1000,
    system: SYSTEM,
    tools: [
      {
        name: "propose_payment",
        description: "Propose a SOL payment to a recipient.",
        input_schema: {
          type: "object",
          properties: {
            recipient: { type: "string", description: "Solana address (base58)" },
            amount_sol: { type: "number", description: "Amount in SOL" },
            memo: { type: "string" },
          },
          required: ["recipient", "amount_sol", "memo"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_payment" },
    messages: [{ role: "user", content: `Process this invoice:\n\n${invoiceText}` }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model did not call propose_payment");
  const input = block.input as { recipient: string; amount_sol: number; memo: string };
  return {
    recipient: new PublicKey(input.recipient),
    amountSol: Number(input.amount_sol),
    memo: String(input.memo ?? ""),
  };
}
