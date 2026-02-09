import dotenv from "dotenv";

dotenv.config();

import { getTokenConfig } from "@token/config/tokens.js";
import { fundAccount } from "@token/services/faucet.service.js";
import { signWithKms } from "@token/services/signing.service.js";
import { disconnect, getClient } from "@token/services/xrpl.service.js";
import type { AccountSet } from "xrpl";
import { encodeForSigning } from "xrpl";

const tokenConfig = getTokenConfig("JPYN");

function isAccountNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("actNotFound") || error.message.includes("Account not found");
}

async function step1FundIssuer(): Promise<void> {
  console.log("\n=== Step 1: Fund issuer account ===");
  const client = await getClient();

  try {
    const response = await client.request({
      command: "account_info",
      account: tokenConfig.issuerAddress,
    });
    console.log(`Account already active. Balance: ${response.result.account_data.Balance} drops`);
    return;
  } catch (error: unknown) {
    if (!isAccountNotFoundError(error)) {
      throw error;
    }
  }

  console.log("Account not found. Funding via testnet faucet...");
  const result = await fundAccount(tokenConfig.issuerAddress);
  console.log(`Funded. Balance: ${result.balance}`);
}

async function step2AccountSet(): Promise<void> {
  console.log("\n=== Step 2: AccountSet (Domain + asfDefaultRipple) ===");
  const client = await getClient();

  const response = await client.request({
    command: "account_info",
    account: tokenConfig.issuerAddress,
  });

  const accountData = response.result.account_data;
  const domainHex = Buffer.from(tokenConfig.domain).toString("hex").toUpperCase();
  const existingDomain = (accountData.Domain ?? "").toUpperCase();
  // lsfDefaultRipple = 0x00800000
  const hasDefaultRipple = ((accountData.Flags ?? 0) & 0x00800000) !== 0;

  if (existingDomain === domainHex && hasDefaultRipple) {
    console.log(`Already set. Domain="${tokenConfig.domain}", DefaultRipple=true`);
    return;
  }

  console.log(`Setting Domain="${tokenConfig.domain}", asfDefaultRipple=true ...`);

  const tx: AccountSet = {
    TransactionType: "AccountSet",
    Account: tokenConfig.issuerAddress,
    Domain: domainHex,
    SetFlag: 8, // asfDefaultRipple
  };

  const prepared = await client.autofill(tx);
  prepared.SigningPubKey = tokenConfig.signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), tokenConfig.kmsKeyPath);

  const signedTx = {
    ...prepared,
    TxnSignature: signature,
  };

  const result = await client.submit(signedTx);

  if (result.result.engine_result !== "tesSUCCESS") {
    throw new Error(`AccountSet failed: ${result.result.engine_result_message}`);
  }

  console.log(`AccountSet submitted. Hash: ${result.result.tx_json?.hash ?? "unknown"}`);
}

async function main(): Promise<void> {
  console.log(`Issuer address: ${tokenConfig.issuerAddress}`);
  console.log(`Domain: ${tokenConfig.domain}`);
  console.log(`Token: ${tokenConfig.tokenId} (${tokenConfig.currency})`);

  await step1FundIssuer();
  await step2AccountSet();

  await disconnect();
  console.log("\nSetup complete.");
}

main().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
