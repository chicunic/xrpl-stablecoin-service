import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { destroyIssuance, disconnect } from "@token/services/xrpl.service.js";

/**
 * Destroy the JPYN issuance. Requires all holder balances = 0.
 *
 * Usage:
 *   tsx src/scripts/mpt-destroy.ts
 */
async function main(): Promise<void> {
  const config = getTokenConfig("JPYN");
  if (!config.mptIssuanceId) {
    throw new Error("JPYN_MPT_ISSUANCE_ID is not set.");
  }

  console.log(`Destroying issuance ${config.mptIssuanceId} (${config.tokenId})...`);
  const txHash = await destroyIssuance(config.mptIssuanceId, config);
  console.log(`Destroyed. txHash: ${txHash}`);
  console.log("Remember to remove JPYN_MPT_ISSUANCE_ID from your environment.");

  await disconnect();
}

main().catch((err: unknown) => {
  console.error("Destroy failed:", err);
  process.exit(1);
});
