import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { createIssuance, disconnect } from "@token/services/xrpl.service.js";

async function main(): Promise<void> {
  const config = getTokenConfig("JPYN");

  console.log("=== Setup MPToken Issuance (JPYN) ===");
  console.log(`Issuer: ${config.issuerAddress}`);
  console.log(`AssetScale: ${String(config.assetScale)}`);
  console.log(`MaximumAmount: ${config.maximumAmount}`);
  console.log(`TransferFee: ${String(config.transferFee)}`);
  const domainDisplay = config.permissionedDomainId === "" ? "(not set)" : config.permissionedDomainId;
  console.log(`DomainID: ${domainDisplay}`);

  if (!config.permissionedDomainId) {
    throw new Error("JPYN_DOMAIN_ID is not set. Run setup-domain first.");
  }
  if (config.mptIssuanceId) {
    console.log(`\nJPYN_MPT_ISSUANCE_ID already set: ${config.mptIssuanceId}`);
    console.log("Remove it from env if you want to create a new issuance.");
    await disconnect();
    return;
  }

  console.log("\nCreating MPToken issuance...");
  const { txHash, mptIssuanceId } = await createIssuance(config);
  console.log(`Issuance created!`);
  console.log(`  txHash: ${txHash}`);
  console.log(`  mptIssuanceId: ${mptIssuanceId}`);
  console.log(`\nSet this in your environment: JPYN_MPT_ISSUANCE_ID=${mptIssuanceId}`);

  await disconnect();
}

main().catch((err: unknown) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
