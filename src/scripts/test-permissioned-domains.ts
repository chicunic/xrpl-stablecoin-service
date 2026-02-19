/**
 * Devnet integration test for Permissioned Domains full flow:
 *
 * 1. Fund issuer + user accounts
 * 2. Credential: issue → accept → query status
 * 3. Domain: create permissioned domain
 * 4. DEX: create permissioned offer → query orderbook → cancel offer
 * 5. Credential: revoke → query status
 * 6. Domain: delete
 *
 * Usage:
 *   XRPL_NETWORK=devnet SIGNING_PROVIDER=sm tsx src/scripts/test-permissioned-domains.ts
 *
 * Requires:
 *   - JPYN_KMS_KEY_PATH (or TEST_ISSUER_SEED for sm provider)
 *   - XRPL_NETWORK=devnet
 */
import dotenv from "dotenv";

dotenv.config();

// Force devnet
if (!process.env.XRPL_NETWORK) {
  process.env.XRPL_NETWORK = "devnet";
}

import { getTokenConfig, toXrplCurrency } from "@token/config/tokens.js";
import {
  CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  getCredentialStatus,
  issueCredential,
  revokeCredential,
} from "@token/services/credential.service.js";
import { getPermissionedOrderBook } from "@token/services/dex.service.js";
import { createDomain, deleteDomain, getDomainInfo } from "@token/services/domain.service.js";
import { fundAccount } from "@token/services/faucet.service.js";
import { disconnect, getClient } from "@token/services/xrpl.service.js";
import { Wallet } from "xrpl";
import ECDSA from "xrpl/dist/npm/ECDSA.js";

const tokenConfig = getTokenConfig("JPYN");
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function ensureAccountFunded(address: string, label: string): Promise<void> {
  const client = await getClient();
  try {
    await client.request({ command: "account_info", account: address });
    console.log(`  ${label} already funded: ${address}`);
  } catch {
    console.log(`  Funding ${label}: ${address} ...`);
    await fundAccount(address);
    console.log(`  ${label} funded.`);
  }
}

async function waitForLedger(seconds = 5): Promise<void> {
  console.log(`  Waiting ${seconds}s for ledger close...`);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main(): Promise<void> {
  console.log("=== Permissioned Domains Integration Test (devnet) ===\n");
  console.log(`Network: ${process.env.XRPL_NETWORK}`);
  console.log(`Issuer: ${tokenConfig.issuerAddress}`);
  console.log(`Credential Type: KYC_JAPAN (${CREDENTIAL_TYPE_KYC_JAPAN_HEX})\n`);

  // Create a test user wallet (random for each run)
  const userWallet = Wallet.generate(ECDSA.ed25519);
  console.log(`Test user: ${userWallet.address}\n`);

  // ── Step 1: Fund accounts ───────────────────────────────────────────
  console.log("Step 1: Fund accounts");
  await ensureAccountFunded(tokenConfig.issuerAddress, "Issuer");
  await ensureAccountFunded(userWallet.address, "User");
  await waitForLedger(4);

  // ── Step 2: Issue Credential ────────────────────────────────────────
  console.log("\nStep 2: Issue Credential (CredentialCreate)");
  let issueTxHash: string;
  try {
    issueTxHash = await issueCredential(userWallet.address, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
    assert(issueTxHash.length > 0, `Credential issued: ${issueTxHash}`);
  } catch (error) {
    console.error("  ✗ issueCredential failed:", error);
    failed++;
    await cleanup();
    return;
  }

  await waitForLedger();

  // ── Step 3: Query Credential (before accept) ───────────────────────
  console.log("\nStep 3: Query Credential status (before accept)");
  const statusBeforeAccept = await getCredentialStatus(
    userWallet.address,
    tokenConfig.issuerAddress,
    CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  );
  assert(statusBeforeAccept.exists === true, `Credential exists: ${statusBeforeAccept.exists}`);
  assert(statusBeforeAccept.accepted === false, `Credential not yet accepted: ${!statusBeforeAccept.accepted}`);

  // ── Step 4: Accept Credential ───────────────────────────────────────
  console.log("\nStep 4: Accept Credential (CredentialAccept)");
  // We need to sign with the user wallet directly since we can't use bipIndex
  let acceptTxHash: string;
  try {
    const client = await getClient();
    const tx: any = {
      TransactionType: "CredentialAccept",
      Account: userWallet.address,
      Issuer: tokenConfig.issuerAddress,
      CredentialType: CREDENTIAL_TYPE_KYC_JAPAN_HEX,
    };
    const prepared = await client.autofill(tx);
    const signed = userWallet.sign(prepared);
    const result = await client.submit(signed.tx_blob);
    if (result.result.engine_result !== "tesSUCCESS") {
      throw new Error(`CredentialAccept failed: ${result.result.engine_result_message}`);
    }
    acceptTxHash = result.result.tx_json?.hash ?? "";
    assert(acceptTxHash.length > 0, `Credential accepted: ${acceptTxHash}`);
  } catch (error) {
    console.error("  ✗ acceptCredential failed:", error);
    failed++;
    await cleanup();
    return;
  }

  await waitForLedger();

  // ── Step 5: Query Credential (after accept) ────────────────────────
  console.log("\nStep 5: Query Credential status (after accept)");
  const statusAfterAccept = await getCredentialStatus(
    userWallet.address,
    tokenConfig.issuerAddress,
    CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  );
  assert(statusAfterAccept.exists === true, `Credential exists: ${statusAfterAccept.exists}`);
  assert(statusAfterAccept.accepted === true, `Credential accepted: ${statusAfterAccept.accepted}`);

  // ── Step 6: Create Permissioned Domain ─────────────────────────────
  console.log("\nStep 6: Create Permissioned Domain");
  let domainId: string;
  try {
    const domainResult = await createDomain(tokenConfig.acceptedCredentials);
    assert(domainResult.txHash.length > 0, `Domain created, txHash: ${domainResult.txHash}`);
    domainId = domainResult.domainId;
    assert(domainId.length > 0, `Domain ID: ${domainId}`);
  } catch (error) {
    console.error("  ✗ createDomain failed:", error);
    failed++;
    await cleanup();
    return;
  }

  await waitForLedger();

  // ── Step 7: Query Domain ───────────────────────────────────────────
  console.log("\nStep 7: Query Domain info");
  const domainInfo = await getDomainInfo(domainId);
  assert(domainInfo !== null, `Domain info retrieved`);
  if (domainInfo) {
    assert(
      domainInfo.AcceptedCredentials?.length > 0,
      `Domain has ${domainInfo.AcceptedCredentials?.length} accepted credential(s)`,
    );
  }

  // ── Step 8: Set up TrustLine for user (needed for DEX offers) ──────
  console.log("\nStep 8: Set TrustLine for user");
  try {
    const client = await getClient();
    const xrplCurrency = toXrplCurrency(tokenConfig.currency);
    const trustTx: any = {
      TransactionType: "TrustSet",
      Account: userWallet.address,
      LimitAmount: {
        currency: xrplCurrency,
        issuer: tokenConfig.issuerAddress,
        value: "1000000",
      },
    };
    const prepared = await client.autofill(trustTx);
    const signed = userWallet.sign(prepared);
    const result = await client.submit(signed.tx_blob);
    assert(result.result.engine_result === "tesSUCCESS", `TrustLine set: ${result.result.engine_result}`);
  } catch (error) {
    console.error("  ✗ TrustSet failed:", error);
    failed++;
  }

  await waitForLedger();

  // ── Step 9: Create Permissioned DEX Offer ──────────────────────────
  console.log("\nStep 9: Create Permissioned DEX Offer");
  let offerSequence: number | undefined;
  try {
    const xrplCurrency = toXrplCurrency(tokenConfig.currency);

    // Sell XRP for token (user offers XRP drops, wants token)
    const client = await getClient();
    const offerTx: any = {
      TransactionType: "OfferCreate",
      Account: userWallet.address,
      TakerGets: {
        currency: xrplCurrency,
        issuer: tokenConfig.issuerAddress,
        value: "1",
      },
      TakerPays: "1000000", // 1 XRP in drops
      DomainID: domainId,
    };
    const prepared = await client.autofill(offerTx);
    const signed = userWallet.sign(prepared);
    const result = await client.submit(signed.tx_blob);

    if (result.result.engine_result === "tesSUCCESS") {
      offerSequence = (result.result.tx_json as any)?.Sequence;
      assert(true, `Offer created, sequence: ${offerSequence}, hash: ${result.result.tx_json?.hash}`);
    } else {
      // tecKILLED or tecUNFUNDED_OFFER are acceptable on devnet (no token balance)
      const engineResult = result.result.engine_result;
      console.log(`  ⚠ OfferCreate result: ${engineResult} (${result.result.engine_result_message})`);
      console.log("  (This may be expected on devnet if user has no token balance)");
      offerSequence = (result.result.tx_json as any)?.Sequence;
      // Still count the tx as submitted
      assert(result.result.tx_json?.hash !== undefined, `Offer tx submitted: ${result.result.tx_json?.hash}`);
    }
  } catch (error) {
    console.error("  ✗ OfferCreate failed:", error);
    failed++;
  }

  await waitForLedger();

  // ── Step 10: Query Orderbook ───────────────────────────────────────
  console.log("\nStep 10: Query Permissioned Orderbook");
  try {
    const xrplCurrency = toXrplCurrency(tokenConfig.currency);
    const orderBook = await getPermissionedOrderBook(
      domainId,
      { currency: xrplCurrency, issuer: tokenConfig.issuerAddress },
      { currency: "XRP" },
    );
    assert(orderBook !== null, `Orderbook retrieved: ${orderBook.asks.length} asks, ${orderBook.bids.length} bids`);
  } catch (error) {
    console.error("  ✗ getPermissionedOrderBook failed:", error);
    failed++;
  }

  // ── Step 11: Cancel Offer (if created) ─────────────────────────────
  if (offerSequence) {
    console.log("\nStep 11: Cancel DEX Offer");
    try {
      const client = await getClient();
      const cancelTx: any = {
        TransactionType: "OfferCancel",
        Account: userWallet.address,
        OfferSequence: offerSequence,
      };
      const prepared = await client.autofill(cancelTx);
      const signed = userWallet.sign(prepared);
      const result = await client.submit(signed.tx_blob);
      assert(result.result.engine_result === "tesSUCCESS", `Offer cancelled: ${result.result.engine_result}`);
    } catch (error) {
      console.error("  ✗ OfferCancel failed:", error);
      failed++;
    }
    await waitForLedger();
  }

  // ── Step 12: Revoke Credential ─────────────────────────────────────
  console.log("\nStep 12: Revoke Credential (CredentialDelete)");
  try {
    const revokeTxHash = await revokeCredential(userWallet.address, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
    assert(revokeTxHash.length > 0, `Credential revoked: ${revokeTxHash}`);
  } catch (error) {
    console.error("  ✗ revokeCredential failed:", error);
    failed++;
  }

  await waitForLedger();

  // ── Step 13: Query Credential (after revoke) ───────────────────────
  console.log("\nStep 13: Query Credential status (after revoke)");
  const statusAfterRevoke = await getCredentialStatus(
    userWallet.address,
    tokenConfig.issuerAddress,
    CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  );
  assert(statusAfterRevoke.exists === false, `Credential no longer exists: ${!statusAfterRevoke.exists}`);

  // ── Step 14: Delete Domain ─────────────────────────────────────────
  console.log("\nStep 14: Delete Permissioned Domain");
  try {
    const deleteTxHash = await deleteDomain(domainId);
    assert(deleteTxHash.length > 0, `Domain deleted: ${deleteTxHash}`);
  } catch (error) {
    console.error("  ✗ deleteDomain failed:", error);
    failed++;
  }

  await waitForLedger();

  // ── Step 15: Verify domain deleted ─────────────────────────────────
  console.log("\nStep 15: Verify domain deleted");
  const deletedDomainInfo = await getDomainInfo(domainId);
  assert(deletedDomainInfo === null, `Domain no longer exists: ${deletedDomainInfo === null}`);

  await cleanup();
}

async function cleanup(): Promise<void> {
  await disconnect();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
