/**
 * Flow integration test — the core custodial journey over REAL endpoints, REAL Firestore
 * emulator, and the REAL localnet ledger:
 *
 *   POST /tokens/:id/authorize       (holder opt-in + issuer approve on-chain)
 *   POST /exchange/fiat-to-mpt       (debit fiat in Firestore, mint MPToken on-chain)
 *   GET  /balance/mpt                (read on-chain balance back == minted amount)
 *   POST /whitelist/xrpl             (whitelist a destination so withdraw is allowed)
 *   POST /withdraw/mpt               (transfer MPToken to the whitelisted address on-chain)
 *
 * Auth is mocked; everything else is real. The bank service is NOT involved in this flow
 * (only fiat withdrawal calls the bank). The holder wallet is a localnet account funded with
 * XRP and granted a KYC credential, so the application-layer KYC gate opens.
 */
import { getTokenConfig } from "@token/config/tokens.js";
import { authorize, getMptBalance, issuerAuthorize } from "@token/services/xrpl.service.js";

const { mockVerifySessionCookie } = vi.hoisted(() => ({ mockVerifySessionCookie: vi.fn() }));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifySessionCookie: mockVerifySessionCookie }),
}));

import app from "@token/app";
import { generateMfaToken } from "@token/services/mfa-token.service.js";
import { disconnect } from "@token/services/xrpl.service.js";
import { bootstrapLocalnetToken, clearFirestore, grantKycCredential, setupHolder } from "../localnet.helper";
import { buildClaims, readFiatBalance, seedUser, seedWallet } from "./flows.helper";

const UID = "flow-core-user";
const HOLDER_BIP = 301;
const DEST_BIP = 302;

async function request(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    Authorization: "Bearer flow-session",
    "content-type": "application/json",
    ...extraHeaders,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(path, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : undefined };
}

describe("Core flow — fiat → MPToken → withdraw (endpoints + emulator + ledger)", () => {
  let mptIssuanceId: string;
  let holder: { address: string; bipIndex: number };
  let destination: string;

  beforeAll(async () => {
    const setup = await bootstrapLocalnetToken();
    mptIssuanceId = setup.mptIssuanceId;

    // Holder: funded localnet account + accepted KYC credential (opens the app-layer gate).
    holder = await setupHolder(HOLDER_BIP);
    await grantKycCredential(holder);

    // Separate funded, KYC'd recipient for the withdrawal; tfMPTRequireAuth means it must opt in AND be issuer-approved to receive a transfer.
    const dest = await setupHolder(DEST_BIP);
    await grantKycCredential(dest);
    const config = getTokenConfig("JPYN");
    await authorize(dest.bipIndex, dest.address, mptIssuanceId);
    await issuerAuthorize(dest.address, mptIssuanceId, config);
    destination = dest.address;

    mockVerifySessionCookie.mockResolvedValue(buildClaims({ uid: UID }));
  }, 120_000);

  afterAll(async () => {
    await disconnect();
  });

  beforeEach(async () => {
    await clearFirestore();
    // User starts with enough fiat to exchange; wallet doc points at the live holder account.
    await seedUser(UID, 100_000);
    await seedWallet(UID, holder.address, holder.bipIndex);
  });

  it("authorizes, mints via exchange, sees the balance, then withdraws on-chain", async () => {
    // 1. Authorize the holder to hold JPYN (opt-in + issuer approve on-chain).
    const authRes = await request("POST", "/api/v1/tokens/JPYN/authorize", {});
    expect(authRes.status).toBe(200);
    expect((authRes.body as { status: string }).status).toBe("ok");

    // 2. Exchange fiat → MPToken: debits fiat in Firestore and mints on-chain.
    const exchangeRes = await request("POST", "/api/v1/exchange/fiat-to-mpt", { tokenId: "JPYN", fiatAmount: 5000 });
    expect(exchangeRes.status).toBe(201);
    expect((exchangeRes.body as { status: string }).status).toBe("completed");

    // Fiat was actually debited in the emulator (100000 - 5000).
    expect(await readFiatBalance(UID)).toBe(95_000);

    // 3. Balance endpoint reflects the on-chain minted amount.
    const balRes = await request("GET", "/api/v1/balance/mpt");
    expect(balRes.status).toBe(200);
    const balBody = balRes.body as { address: string; balances: { mptIssuanceId: string; value: string }[] };
    const jpyn = balBody.balances.find((b) => b.mptIssuanceId === mptIssuanceId);
    expect(jpyn).toBeDefined();
    expect(BigInt(jpyn?.value ?? "0")).toBe(5000n);

    // 4. Whitelist the destination, then withdraw MPToken to it (real on-chain transfer).
    const mfaToken = generateMfaToken(UID);
    const mfaHeader = { "x-mfa-token": mfaToken };

    const wlRes = await request("POST", "/api/v1/whitelist/xrpl", { address: destination, label: "dest" }, mfaHeader);
    expect(wlRes.status).toBe(201);

    const wdRes = await request(
      "POST",
      "/api/v1/withdraw/mpt",
      { tokenId: "JPYN", tokenAmount: 1000, destinationAddress: destination },
      mfaHeader,
    );
    expect(wdRes.status).toBe(201);
    expect((wdRes.body as { xrplTxHash: string }).xrplTxHash).toBeTruthy();

    // 5. On-chain balances confirm the transfer settled: holder 4000, destination 1000.
    expect(BigInt(await getMptBalance(holder.address, mptIssuanceId))).toBe(4000n);
    expect(BigInt(await getMptBalance(destination, mptIssuanceId))).toBe(1000n);
  }, 120_000);
});
