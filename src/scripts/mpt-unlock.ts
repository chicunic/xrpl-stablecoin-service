import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { disconnect, unlock } from "@token/services/xrpl.service.js";

/**
 * Unlock the JPYN issuance, or a single holder if an address is passed.
 *
 * Usage:
 *   tsx src/scripts/mpt-unlock.ts [holderAddress]
 */
async function main(): Promise<void> {
  const config = getTokenConfig("JPYN");
  if (!config.mptIssuanceId) {
    throw new Error("JPYN_MPT_ISSUANCE_ID is not set.");
  }

  const holderAddress = process.argv[2];
  console.log(`Unlocking ${config.tokenId}${holderAddress ? ` for holder ${holderAddress}` : " (global)"}...`);

  const txHash = await unlock(config.mptIssuanceId, config, holderAddress);
  console.log(`Unlocked. txHash: ${txHash}`);

  await disconnect();
}

main().catch((err: unknown) => {
  console.error("Unlock failed:", err);
  process.exit(1);
});
