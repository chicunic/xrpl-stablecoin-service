/**
 * Flow integration test — fiat withdrawal over REAL endpoints + REAL Firestore emulator, with
 * the bank service's outbound HTTP boundary stubbed (per test-strategy: flow tests don't run a
 * real bank, they mock its HTTP edge):
 *
 *   POST /whitelist/bank      (whitelist the destination bank account)
 *   POST /withdraw/fiat       (debit fiat in Firestore, call the bank transfer HTTP edge)
 *   GET  /balance/fiat        (balance reflects the debit)
 *
 * The only mocked boundaries are Firebase Auth and the bank's HTTP endpoint (global fetch).
 * Everything else — fiat debit, whitelist checks, balance read — is real against the emulator.
 */
const { mockVerifySessionCookie } = vi.hoisted(() => ({ mockVerifySessionCookie: vi.fn() }));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifySessionCookie: mockVerifySessionCookie }),
}));

import app from "@token/app";
import { generateMfaToken } from "@token/services/mfa-token.service.js";
import { clearFirestore } from "../localnet.helper";
import { buildClaims, readFiatBalance, seedUser, seedWallet } from "./flows.helper";
import { deriveWallet } from "@token/services/wallet.service.js";

const UID = "flow-fiat-withdraw-user";

const BANK_ACCOUNT = {
  bankCode: "0001",
  branchCode: "002",
  accountNumber: "7654321",
  accountHolder: "Flow Test User",
  label: "salary",
};

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

describe("Fiat withdrawal flow — endpoints + emulator + mocked bank HTTP edge", () => {
  const BANK_URL = "http://bank.test.local"; // matches BANK_SERVICE_URL in vitest.integration.config.ts
  const realFetch = globalThis.fetch.bind(globalThis);
  // Count only the bank-edge calls (the Firestore emulator also uses fetch and must pass through).
  const bankCalls = vi.fn();

  beforeAll(() => {
    mockVerifySessionCookie.mockResolvedValue(buildClaims({ uid: UID }));
    // Intercept ONLY the bank transfer HTTP edge; everything else (the emulator) hits the network.
    vi.stubGlobal("fetch", (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(BANK_URL)) {
        bankCalls(url, init);
        return Promise.resolve(
          new Response(JSON.stringify({ transactionId: "bank-ref-123" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return realFetch(input, init);
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    bankCalls.mockReset();
    await clearFirestore();
    await seedUser(UID, 50_000);
    await seedWallet(UID, deriveWallet(500).address, 500);
  });

  it("whitelists a bank account, withdraws fiat, and the balance reflects the debit", async () => {
    const mfaHeader = { "x-mfa-token": generateMfaToken(UID) };

    // 1. Whitelist the destination bank account.
    const wlRes = await request("POST", "/api/v1/whitelist/bank", BANK_ACCOUNT, mfaHeader);
    expect(wlRes.status).toBe(201);

    // 2. Withdraw fiat — debits Firestore and calls the (stubbed) bank transfer edge.
    const wdRes = await request(
      "POST",
      "/api/v1/withdraw/fiat",
      { amount: 20_000, bankAccount: BANK_ACCOUNT },
      mfaHeader,
    );
    expect(wdRes.status).toBe(201);
    const result = wdRes.body as { amount: number; txReference: string };
    expect(result.amount).toBe(20_000);
    expect(result.txReference).toBe("bank-ref-123");

    // The bank transfer HTTP edge was actually invoked.
    expect(bankCalls).toHaveBeenCalledTimes(1);

    // 3. Fiat balance reflects the debit (50000 - 20000), both via the endpoint and directly.
    const balRes = await request("GET", "/api/v1/balance/fiat");
    expect((balRes.body as { balance: number }).balance).toBe(30_000);
    expect(await readFiatBalance(UID)).toBe(30_000);
  });

  it("rejects a withdrawal to a non-whitelisted bank account without debiting", async () => {
    const mfaHeader = { "x-mfa-token": generateMfaToken(UID) };

    const wdRes = await request(
      "POST",
      "/api/v1/withdraw/fiat",
      { amount: 20_000, bankAccount: BANK_ACCOUNT },
      mfaHeader,
    );
    expect(wdRes.status).toBe(400);

    // No bank call, no balance change.
    expect(bankCalls).not.toHaveBeenCalled();
    expect(await readFiatBalance(UID)).toBe(50_000);
  });
});
