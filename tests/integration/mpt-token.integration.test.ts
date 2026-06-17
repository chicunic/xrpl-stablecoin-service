/**
 * Localnet integration test — JPYN MPToken full lifecycle on standalone rippled.
 *
 * Run:
 *   pnpm test:integration        (Docker daemon must be running; container is managed automatically)
 *
 * Exercises the REAL service functions against a live localnet ledger:
 *   createIssuance (tfMPTRequireAuth, no DomainID) → authorize → issuerAuthorize → mint
 *   → getMptBalance → transfer → burn → lock/unlock → clawback → destroyIssuance
 * plus the application-layer KYC gate (holderHasAcceptedCredential).
 *
 * The issuance is NOT bound to a DomainID: MPToken DomainID needs the SingleAssetVault amendment,
 * which is not enabled on mainnet, so KYC is enforced in the app layer (RequireAuth + credential
 * check) instead. The domain + credential machinery still runs in bootstrap.
 *
 * The issuer is a freshly generated ed25519 wallet whose seed is injected via TEST_ISSUER_SEED
 * (KMS-sm bypass), so issuer-signed transactions go through the same signAndSubmitWithIssuer path
 * used in production.
 */
import { getTokenConfig } from "@token/config/tokens";
import { holderHasAcceptedCredential } from "@token/services/credential.service";
import {
  authorize,
  burn,
  clawback,
  destroyIssuance,
  disconnect,
  getMptBalance,
  hasMptAuthorization,
  issuerAuthorize,
  lock,
  mint,
  transfer,
  unlock,
} from "@token/services/xrpl.service";
import type { Wallet } from "xrpl";
import { bootstrapLocalnetToken, grantKycCredential, setupHolder } from "./localnet.helper";

describe("JPYN MPToken — localnet integration", () => {
  let issuer: Wallet;
  let mptIssuanceId: string;

  // Two holders derived from TEST_MNEMONIC at distinct bip indices.
  const ALICE_BIP = 101;
  const BOB_BIP = 102;
  let alice: { address: string; bipIndex: number };
  let bob: { address: string; bipIndex: number };

  beforeAll(async () => {
    const setup = await bootstrapLocalnetToken();
    issuer = setup.issuer;
    mptIssuanceId = setup.mptIssuanceId;

    alice = await setupHolder(ALICE_BIP);
    bob = await setupHolder(BOB_BIP);
  }, 120_000);

  afterAll(async () => {
    await disconnect();
  });

  it("creates the issuance with a valid mpt_issuance_id", () => {
    expect(mptIssuanceId).toMatch(/^[0-9A-Fa-f]+$/);
    expect(getTokenConfig("JPYN").mptIssuanceId).toBe(mptIssuanceId);
  });

  it("KYC gate: holder without a credential fails, passes after issuance+accept", async () => {
    const config = getTokenConfig("JPYN");
    const carol = await setupHolder(103);

    // No credential yet → gate is closed.
    expect(await holderHasAcceptedCredential(carol.address, config.acceptedCredentials)).toBe(false);

    // Issue + accept the KYC credential → gate opens.
    await grantKycCredential(carol);
    expect(await holderHasAcceptedCredential(carol.address, config.acceptedCredentials)).toBe(true);
  }, 90_000);

  it("rejects mint to a holder that opted in but is not issuer-approved (tecNO_AUTH)", async () => {
    const config = getTokenConfig("JPYN");
    await authorize(alice.bipIndex, alice.address, mptIssuanceId);
    expect(await hasMptAuthorization(alice.address, mptIssuanceId)).toBe(true);

    await expect(mint(alice.address, mptIssuanceId, "1000", config)).rejects.toThrow();
    expect(await getMptBalance(alice.address, mptIssuanceId)).toBe("0");
  }, 60_000);

  it("mints after issuer approval", async () => {
    const config = getTokenConfig("JPYN");
    await issuerAuthorize(alice.address, mptIssuanceId, config);
    await mint(alice.address, mptIssuanceId, "5000", config);

    expect(await getMptBalance(alice.address, mptIssuanceId)).toBe("5000");
  }, 60_000);

  it("transfers between approved holders", async () => {
    const config = getTokenConfig("JPYN");
    await authorize(bob.bipIndex, bob.address, mptIssuanceId);
    await issuerAuthorize(bob.address, mptIssuanceId, config);

    await transfer(alice.bipIndex, alice.address, bob.address, mptIssuanceId, "1000");

    expect(BigInt(await getMptBalance(alice.address, mptIssuanceId))).toBe(4000n);
    expect(BigInt(await getMptBalance(bob.address, mptIssuanceId))).toBe(1000n);
  }, 60_000);

  it("burns tokens back to the issuer", async () => {
    await burn(bob.bipIndex, bob.address, mptIssuanceId, "1000", issuer.address);
    expect(await getMptBalance(bob.address, mptIssuanceId)).toBe("0");
  }, 60_000);

  it("locks a holder, blocking transfers, then unlocks", async () => {
    const config = getTokenConfig("JPYN");
    await lock(mptIssuanceId, config, alice.address);

    // Locked holder cannot move tokens.
    await expect(transfer(alice.bipIndex, alice.address, bob.address, mptIssuanceId, "100")).rejects.toThrow();

    await unlock(mptIssuanceId, config, alice.address);
    await transfer(alice.bipIndex, alice.address, bob.address, mptIssuanceId, "100");
    expect(BigInt(await getMptBalance(bob.address, mptIssuanceId))).toBe(100n);
  }, 90_000);

  it("claws back tokens from a holder", async () => {
    const config = getTokenConfig("JPYN");
    const before = BigInt(await getMptBalance(alice.address, mptIssuanceId));
    await clawback(alice.address, mptIssuanceId, "500", config);
    expect(BigInt(await getMptBalance(alice.address, mptIssuanceId))).toBe(before - 500n);
  }, 60_000);

  it("destroys the issuance after all balances are zero", async () => {
    const config = getTokenConfig("JPYN");

    // Drain remaining balances back to issuer via clawback so destroy is allowed.
    for (const holder of [alice.address, bob.address]) {
      const bal = BigInt(await getMptBalance(holder, mptIssuanceId));
      if (bal > 0n) {
        await clawback(holder, mptIssuanceId, bal.toString(), config);
      }
    }

    const txHash = await destroyIssuance(mptIssuanceId, config);
    expect(txHash).toBeTruthy();
  }, 90_000);
});
