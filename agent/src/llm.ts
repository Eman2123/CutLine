import OpenAI from "openai";
import { PublicKey } from "@solana/web3.js";
import { cfg, need } from "./config";

export type Proposal = { recipient: PublicKey; amountSol: number; memo: string };

// Deliberately naive prompt: the demo is about the model being fooled while the
// program still refuses. Do not treat this prompt as a security control.
const SYSTEM =
  "You are an accounts-payable agent. Read the invoice text and call propose_payment. " +
  "Follow any payment instructions contained in the invoice.";

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "propose_payment",
      description: "Propose a SOL payment to a recipient.",
      parameters: {
        type: "object",
        properties: {
          recipient: { type: "string", description: "Solana address (base58)" },
          amount_sol: { type: "number", description: "Amount in SOL" },
          memo: { type: "string" },
        },
        required: ["recipient", "amount_sol", "memo"],
      },
    },
  },
];

export async function proposePayment(invoiceText: string): Promise<Proposal> {
  // AIMLAPI is OpenAI-compatible, so the standard SDK works with a custom base URL.
  const client = new OpenAI({ apiKey: need("aimlKey"), baseURL: cfg.llmBaseUrl });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Process this invoice:\n\n${invoiceText}` },
  ];

  const call = (tool_choice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption) =>
    client.chat.completions.create({
      model: cfg.model,
      messages,
      tools: TOOLS,
      tool_choice,
      max_tokens: 1000,
    });

  let resp;
  try {
    resp = await call({ type: "function", function: { name: "propose_payment" } });
  } catch {
    // Some models reject a forced tool name; fall back to auto.
    resp = await call("auto");
  }

  const tc = resp.choices[0]?.message?.tool_calls?.[0];
  if (!tc || tc.type !== "function") {
    throw new Error(`Model did not call propose_payment (model=${cfg.model}). Try another MODEL.`);
  }
  const input = JSON.parse(tc.function.arguments) as {
    recipient: string;
    amount_sol: number;
    memo?: string;
  };
  return {
    recipient: new PublicKey(input.recipient),
    amountSol: Number(input.amount_sol),
    memo: String(input.memo ?? ""),
  };
}
