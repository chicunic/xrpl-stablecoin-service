/**
 * Flow integration test — whitelist management + bank deposit credit, over REAL endpoints and
 * the REAL Firestore emulator (no ledger needed):
 *
 *   POST   /whitelist/xrpl            (add)
 *   GET    /whitelist/xrpl            (list — entry present)
 *   DELETE /whitelist/xrpl/:address   (remove)
 *   GET    /whitelist/xrpl            (list — entry gone)
 *   POST   /pubsub/bank/deposit       (bank pushes a deposit event → credit fiat)
 *   GET    /balance/fiat              (balance reflects the credited amount)
 *
 * Auth is mocked; Firestore is the real emulator. The bank deposit arrives as a Pub/Sub push
 * (the bank calls us), so no outbound bank HTTP is involved here.
 */
const { mockVerifySessionCookie } = vi.hoisted(() => ({ mockVerifySessionCookie: vi.fn() }));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifySessionCookie: mockVerifySessionCookie }),
}));

import app from "@token/app";
import { deriveWallet } from "@token/services/wallet.service.js";
import { generateMfaToken } from "@token/services/mfa-token.service.js";
import { clearFirestore } from "../localnet.helper";
import { buildClaims, seedUser, seedVirtualAccount, seedWallet } from "./flows.helper";

const UID = "flow-bank-user";
const VIRTUAL_ACCOUNT_NUMBER = "0010001";

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

/** Build a Pub/Sub push envelope wrapping a bank deposit event. */
function bankDepositEnvelope(messageId: string, event: Record<string, unknown>) {
  return {
    message: {
      messageId,
      data: Buffer.from(JSON.stringify(event)).toString("base64"),
    },
  };
}

describe("Whitelist + bank deposit flow — endpoints + Firestore emulator", () => {
  const otherAddress = deriveWallet(401).address;

  beforeAll(() => {
    mockVerifySessionCookie.mockResolvedValue(buildClaims({ uid: UID }));
  });

  beforeEach(async () => {
    await clearFirestore();
    await seedUser(UID, 0);
    await seedWallet(UID, deriveWallet(400).address, 400);
    await seedVirtualAccount(UID, {
      bankCode: "9999",
      branchCode: "001",
      accountNumber: VIRTUAL_ACCOUNT_NUMBER,
      accountHolder: "Flow Test User",
    });
  });

  it("adds and removes an xrpl whitelist entry, data flowing through each step", async () => {
    const mfaHeader = { "x-mfa-token": generateMfaToken(UID) };

    // Add.
    const addRes = await request(
      "POST",
      "/api/v1/whitelist/xrpl",
      { address: otherAddress, label: "friend" },
      mfaHeader,
    );
    expect(addRes.status).toBe(201);

    // List — entry present.
    const afterAdd = await request("GET", "/api/v1/whitelist/xrpl");
    expect((afterAdd.body as { address: string }[]).some((w) => w.address === otherAddress)).toBe(true);

    // Remove.
    const delRes = await request("DELETE", `/api/v1/whitelist/xrpl/${otherAddress}`, undefined, mfaHeader);
    expect(delRes.status).toBe(200);

    // List — entry gone.
    const afterDel = await request("GET", "/api/v1/whitelist/xrpl");
    expect((afterDel.body as { address: string }[]).some((w) => w.address === otherAddress)).toBe(false);
  });

  it("credits fiat from a bank deposit Pub/Sub push, visible via balance endpoint", async () => {
    // Bank pushes a deposit for this user's virtual account.
    const depositRes = await request(
      "POST",
      "/api/v1/pubsub/bank/deposit",
      bankDepositEnvelope("msg-1", {
        transactionId: "bank-tx-1",
        amount: 30_000,
        virtualAccountNumber: VIRTUAL_ACCOUNT_NUMBER,
      }),
    );
    expect(depositRes.status).toBe(200);
    expect((depositRes.body as { status: string }).status).toBe("ok");

    // Balance endpoint shows the credited amount.
    const balRes = await request("GET", "/api/v1/balance/fiat");
    expect(balRes.status).toBe(200);
    expect((balRes.body as { balance: number }).balance).toBe(30_000);

    // Idempotency: re-pushing the same messageId must NOT double-credit.
    const replay = await request(
      "POST",
      "/api/v1/pubsub/bank/deposit",
      bankDepositEnvelope("msg-1", {
        transactionId: "bank-tx-1",
        amount: 30_000,
        virtualAccountNumber: VIRTUAL_ACCOUNT_NUMBER,
      }),
    );
    expect(replay.status).toBe(200);

    const balAfterReplay = await request("GET", "/api/v1/balance/fiat");
    expect((balAfterReplay.body as { balance: number }).balance).toBe(30_000);
  });
});
