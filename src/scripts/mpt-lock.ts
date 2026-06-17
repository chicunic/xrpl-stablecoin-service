import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { disconnect, lock } from "@token/services/xrpl.service.js";

/**
 * Lock the JPYN issuance, or a single holder if an address is passed.
 *
 * Usage:
 *   tsx src/scripts/mpt-lock.ts [holderAddress]
 */
async function main(): Promise<void> {
  const config = getTokenConfig("JPYN");
  if (!config.mptIssuanceId) {
    throw new Error("JPYN_MPT_ISSUANCE_ID is not set.");
  }

  const holderAddress = process.argv[2];
  console.log(`Locking ${config.tokenId}${holderAddress ? ` for holder ${holderAddress}` : " (global)"}...`);

  const txHash = await lock(config.mptIssuanceId, config, holderAddress);
  console.log(`Locked. txHash: ${txHash}`);

  await disconnect();
}

main().catch((err: unknown) => {
  console.error("Lock failed:", err);
  process.exit(1);
});
