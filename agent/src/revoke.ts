import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { cfg, need } from "./config";
import { explorer, getProgram, loadKeypair, rootPdas, sendLanding } from "./chain";
import { logEvent } from "./log";

/** Demo helper: revoke the root from the CLI. Add --withdraw to pull the vault balance back. */
async function main() {
  const owner = loadKeypair(cfg.ownerKeypair);
  const { program, conn } = getProgram(owner, cfg.rpc);
  const rootId = new anchor.BN(need("rootId"));
  const { root, vault } = rootPdas(program, new PublicKey(need("rootOwner")), rootId);

  const tx = await program.methods
    .revokeRoot()
    .accountsPartial({ owner: owner.publicKey, root })
    .transaction();
  const res = await sendLanding(conn, tx, owner);
  const r = await program.account.rootAuthorization.fetch(root);
  logEvent({
    event: "revoke_root",
    ok: res.ok,
    errorCode: res.errorCode,
    newEpoch: r.epoch.toNumber(),
    active: r.active,
    signature: res.signature,
    explorer: explorer(res.signature),
  });

  if (process.argv.includes("--withdraw")) {
    const wtx = await program.methods
      .withdraw()
      .accountsPartial({ owner: owner.publicKey, root, vault })
      .transaction();
    const w = await sendLanding(conn, wtx, owner);
    logEvent({
      event: "withdraw",
      ok: w.ok,
      errorCode: w.errorCode,
      signature: w.signature,
      explorer: explorer(w.signature),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
