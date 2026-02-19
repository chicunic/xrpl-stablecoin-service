import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { createDomain, getDomainInfo } from "@token/services/domain.service.js";
import { disconnect } from "@token/services/xrpl.service.js";

async function main() {
  const config = getTokenConfig("JPYN");
  console.log("JPYN Token Config:");
  console.log(`  Issuer: ${config.issuerAddress}`);
  console.log(`  Domain ID env: ${config.permissionedDomainId || "(not set)"}`);
  console.log(`  Accepted Credentials: ${config.acceptedCredentials.length}`);

  if (config.permissionedDomainId) {
    console.log("\nQuerying existing domain...");
    const info = await getDomainInfo(config.permissionedDomainId);
    if (info) {
      console.log("Domain found:");
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log("Domain not found on ledger. Consider creating a new one.");
    }
  } else {
    console.log("\nNo JPYN_DOMAIN_ID set. Creating new Permissioned Domain...");
    const result = await createDomain(config.acceptedCredentials);
    console.log(`Domain created!`);
    console.log(`  txHash: ${result.txHash}`);
    console.log(`  domainId: ${result.domainId}`);
    console.log(`\nSet this in your environment: JPYN_DOMAIN_ID=${result.domainId}`);
  }

  await disconnect();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
