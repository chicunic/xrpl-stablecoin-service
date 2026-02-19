/**
 * Devnet integration test — Permissioned Domains full lifecycle.
 *
 * Run:
 *   pnpm test:integration
 *
 * Requires env:
 *   XRPL_NETWORK=devnet
 *   SIGNING_PROVIDER=sm
 *   JPYN_KMS_KEY_PATH  (or TEST_ISSUER_SEED)
 *
 * Flow:
 *   1. Fund issuer & random user
 *   2. CredentialCreate  → issuer issues credential to user
 *   3. CredentialAccept  → user accepts credential
 *   4. ledger_entry      → verify credential exists & accepted
 *   5. PermissionedDomainSet → create domain
 *   6. ledger_entry      → verify domain exists
 *   7. TrustSet          → user trusts token (needed for offer)
 *   8. OfferCreate       → user places permissioned DEX offer
 *   9. book_offers       → query orderbook
 *  10. OfferCancel       → cancel offer
 *  11. CredentialDelete  → revoke credential
 *  12. PermissionedDomainDelete → delete domain
 *  13. Verify both gone from ledger
 */

import { getTokenConfig, toXrplCurrency } from "@token/config/tokens";
import {
  CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  getCredentialStatus,
  issueCredential,
  revokeCredential,
} from "@token/services/credential.service";
import { getPermissionedOrderBook } from "@token/services/dex.service";
import { createDomain, deleteDomain, getDomainInfo } from "@token/services/domain.service";
import { fundAccount } from "@token/services/faucet.service";
import { disconnect, getClient } from "@token/services/xrpl.service";
import type { Client, SubmitResponse } from "xrpl";
import { Wallet } from "xrpl";
import ECDSA from "xrpl/dist/npm/ECDSA";

/* ---------- helpers ---------- */

const tokenConfig = getTokenConfig("JPYN");

async function ensureFunded(client: Client, address: string): Promise<void> {
  try {
    await client.request({ command: "account_info", account: address });
  } catch {
    await fundAccount(address);
    await waitForValidation();
  }
}

function waitForValidation(ms = 5_000): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function assertTxSuccess(result: SubmitResponse, label: string): string {
  const engineResult = result.result.engine_result;
  if (engineResult !== "tesSUCCESS") {
    throw new Error(`${label}: ${engineResult} — ${result.result.engine_result_message}`);
  }
  return result.result.tx_json?.hash ?? "";
}

async function submitUserTx(client: Client, wallet: Wallet, tx: Record<string, unknown>): Promise<SubmitResponse> {
  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  return client.submit(signed.tx_blob);
}

/* ---------- test suite ---------- */

describe("Permissioned Domains — devnet integration", () => {
  let client: Client;
  let userWallet: Wallet;
  let domainId: string;
  let offerSequence: number | undefined;

  beforeAll(async () => {
    client = await getClient();
    userWallet = Wallet.generate(ECDSA.ed25519);

    // Fund both accounts
    await ensureFunded(client, tokenConfig.issuerAddress);
    await ensureFunded(client, userWallet.address);
    await waitForValidation();
  }, 60_000);

  afterAll(async () => {
    await disconnect();
  });

  /* ── Phase 1: Credentials ──────────────────────────────── */

  describe("Phase 1: Credential lifecycle", () => {
    let issueTxHash: string;

    it("should issue a credential (CredentialCreate)", async () => {
      issueTxHash = await issueCredential(userWallet.address, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
      expect(issueTxHash).toBeTruthy();
      await waitForValidation();
    }, 30_000);

    it("should show credential as exists but NOT accepted", async () => {
      const status = await getCredentialStatus(
        userWallet.address,
        tokenConfig.issuerAddress,
        CREDENTIAL_TYPE_KYC_JAPAN_HEX,
      );
      expect(status.exists).toBe(true);
      expect(status.accepted).toBe(false);
    });

    it("should accept the credential (CredentialAccept)", async () => {
      const result = await submitUserTx(client, userWallet, {
        TransactionType: "CredentialAccept",
        Account: userWallet.address,
        Issuer: tokenConfig.issuerAddress,
        CredentialType: CREDENTIAL_TYPE_KYC_JAPAN_HEX,
      });
      const hash = assertTxSuccess(result, "CredentialAccept");
      expect(hash).toBeTruthy();
      await waitForValidation();
    }, 30_000);

    it("should show credential as accepted", async () => {
      const status = await getCredentialStatus(
        userWallet.address,
        tokenConfig.issuerAddress,
        CREDENTIAL_TYPE_KYC_JAPAN_HEX,
      );
      expect(status.exists).toBe(true);
      expect(status.accepted).toBe(true);
    });
  });

  /* ── Phase 2: Permissioned Domain ──────────────────────── */

  describe("Phase 2: Permissioned Domain lifecycle", () => {
    it("should create a permissioned domain", async () => {
      const result = await createDomain(tokenConfig.acceptedCredentials);
      expect(result.txHash).toBeTruthy();
      expect(result.domainId).toBeTruthy();
      domainId = result.domainId;
      await waitForValidation();
    }, 30_000);

    it("should retrieve domain info from ledger", async () => {
      const info = await getDomainInfo(domainId);
      expect(info).not.toBeNull();
      expect(info.AcceptedCredentials?.length).toBeGreaterThan(0);
    });
  });

  /* ── Phase 3: Permissioned DEX ─────────────────────────── */

  describe("Phase 3: Permissioned DEX", () => {
    it("should set TrustLine for user", async () => {
      const result = await submitUserTx(client, userWallet, {
        TransactionType: "TrustSet",
        Account: userWallet.address,
        LimitAmount: {
          currency: toXrplCurrency(tokenConfig.currency),
          issuer: tokenConfig.issuerAddress,
          value: "1000000",
        },
      });
      assertTxSuccess(result, "TrustSet");
      await waitForValidation();
    }, 30_000);

    it("should create a permissioned offer (OfferCreate + DomainID)", async () => {
      const result = await submitUserTx(client, userWallet, {
        TransactionType: "OfferCreate",
        Account: userWallet.address,
        TakerGets: {
          currency: toXrplCurrency(tokenConfig.currency),
          issuer: tokenConfig.issuerAddress,
          value: "1",
        },
        TakerPays: "1000000", // 1 XRP
        DomainID: domainId,
      });

      // tesSUCCESS or tecKILLED/tecUNFUNDED_OFFER (no token balance on devnet)
      const engine = result.result.engine_result;
      expect(["tesSUCCESS", "tecKILLED", "tecUNFUNDED_OFFER"]).toContain(engine);

      offerSequence = (result.result.tx_json as any)?.Sequence;
      expect(offerSequence).toBeDefined();
      await waitForValidation();
    }, 30_000);

    it("should query permissioned orderbook", async () => {
      const xrplCurrency = toXrplCurrency(tokenConfig.currency);
      const orderBook = await getPermissionedOrderBook(
        domainId,
        { currency: xrplCurrency, issuer: tokenConfig.issuerAddress },
        { currency: "XRP" },
      );
      expect(orderBook).toHaveProperty("asks");
      expect(orderBook).toHaveProperty("bids");
    });

    it("should cancel the offer (OfferCancel)", async () => {
      if (!offerSequence) return;

      const result = await submitUserTx(client, userWallet, {
        TransactionType: "OfferCancel",
        Account: userWallet.address,
        OfferSequence: offerSequence,
      });
      // tesSUCCESS even if offer was already consumed/killed
      const engine = result.result.engine_result;
      expect(["tesSUCCESS", "tecNO_ENTRY"]).toContain(engine);
      await waitForValidation();
    }, 30_000);
  });

  /* ── Phase 4: Cleanup ──────────────────────────────────── */

  describe("Phase 4: Cleanup & verify deletion", () => {
    it("should revoke credential (CredentialDelete)", async () => {
      const txHash = await revokeCredential(userWallet.address, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
      expect(txHash).toBeTruthy();
      await waitForValidation();
    }, 30_000);

    it("should confirm credential no longer exists", async () => {
      const status = await getCredentialStatus(
        userWallet.address,
        tokenConfig.issuerAddress,
        CREDENTIAL_TYPE_KYC_JAPAN_HEX,
      );
      expect(status.exists).toBe(false);
    });

    it("should delete permissioned domain", async () => {
      const txHash = await deleteDomain(domainId);
      expect(txHash).toBeTruthy();
      await waitForValidation();
    }, 30_000);

    it("should confirm domain no longer exists", async () => {
      const info = await getDomainInfo(domainId);
      expect(info).toBeNull();
    });
  });
});
