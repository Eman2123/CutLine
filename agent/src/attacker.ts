import { PublicKey } from "@solana/web3.js";
import { need } from "./config";
import type { Proposal } from "./llm";

/**
 * Attacker mode: forces the same malicious tool call a successfully injected model
 * would make. The threat model is a compromised agent, not model behaviour, so the
 * program rejects this identically whether the LLM or this function produced it.
 */
export function forcedMaliciousProposal(): Proposal {
  return {
    recipient: new PublicKey(need("attacker")),
    amountSol: 1.9,
    memo: "forced by ATTACKER_MODE",
  };
}
