import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { clawback, disconnect } from "@token/services/xrpl.service.js";

/**
 * Claw back tokens from a holder back to the issuer.
 *
 * Usage:
 *   tsx src/scripts/mpt-clawback.ts <holderAddress> <amount>
 */
async function main(): Promise<void> {
  const config = getTokenConfig("JPYN");
  if (!config.mptIssuanceId) {
    throw new Error("JPYN_MPT_ISSUANCE_ID is not set.");
  }

  const holderAddress = process.argv[2];
  const amount = process.argv[3];
  if (!holderAddress || !amount) {
    throw new Error("Usage: tsx src/scripts/mpt-clawback.ts <holderAddress> <amount>");
  }

  console.log(`Clawing back ${amount} ${config.tokenId} from ${holderAddress}...`);
  const txHash = await clawback(holderAddress, config.mptIssuanceId, amount, config);
  console.log(`Clawback done. txHash: ${txHash}`);

  await disconnect();
}

main().catch((err: unknown) => {
  console.error("Clawback failed:", err);
  process.exit(1);
});
