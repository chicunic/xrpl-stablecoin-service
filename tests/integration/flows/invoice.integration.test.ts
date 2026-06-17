/**
 * Flow integration test — invoice journey over the REAL endpoints + REAL Firestore emulator.
 *
 *   POST /invoices/send  →  GET /invoices  →  GET /invoices/:id  →  POST /invoices/:id/cancel
 *
 * Auth is mocked (offline cookie verification); Firestore is the real emulator. send/list/get/
 * cancel never touch the ledger, so this flow needs no XRPL transactions — it proves that data
 * written by one endpoint is visible and correct through the next.
 */
import { deriveWallet } from "@token/services/wallet.service.js";

const { mockVerifySessionCookie } = vi.hoisted(() => ({ mockVerifySessionCookie: vi.fn() }));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifySessionCookie: mockVerifySessionCookie }),
}));

import app from "@token/app";
import { clearFirestore } from "../localnet.helper";
import { buildClaims, seedUser, seedWallet } from "./flows.helper";

const UID = "flow-invoice-user";
const AUTH = { Authorization: "Bearer flow-session", "content-type": "application/json" };

async function request(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: AUTH };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(path, init);
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : undefined };
}

describe("Invoice flow — endpoints + Firestore emulator", () => {
  let walletAddress: string;

  beforeAll(() => {
    // The holder wallet for this flow; recipientAddress on a send invoice must equal it.
    walletAddress = deriveWallet(201).address;
    mockVerifySessionCookie.mockResolvedValue(buildClaims({ uid: UID }));
  });

  beforeEach(async () => {
    await clearFirestore();
    await seedUser(UID);
    await seedWallet(UID, walletAddress, 201);
  });

  it("send → list → get → cancel, with data flowing through each step", async () => {
    // 1. Send an invoice (recipientAddress must be the user's own wallet).
    const sendRes = await request("POST", "/api/v1/invoices/send", {
      tokenId: "JPYN",
      amount: 5000,
      recipientAddress: walletAddress,
      recipientName: "田中太郎",
      description: "テスト請求書",
    });
    expect(sendRes.status).toBe(201);
    const created = sendRes.body as { invoiceId: string; status: string; amount: number };
    expect(created.status).toBe("pending");
    expect(created.amount).toBe(5000);
    const { invoiceId } = created;

    // 2. List invoices — the one we just created must show up.
    const listRes = await request("GET", "/api/v1/invoices?type=send");
    expect(listRes.status).toBe(200);
    const list = listRes.body as { invoiceId: string }[];
    expect(list.some((i) => i.invoiceId === invoiceId)).toBe(true);

    // 3. Get the specific invoice — values must match what send produced.
    const getRes = await request("GET", `/api/v1/invoices/${invoiceId}`);
    expect(getRes.status).toBe(200);
    const fetched = getRes.body as { invoiceId: string; amount: number; status: string };
    expect(fetched.invoiceId).toBe(invoiceId);
    expect(fetched.amount).toBe(5000);
    expect(fetched.status).toBe("pending");

    // 4. Cancel it — status must transition to cancelled and persist.
    const cancelRes = await request("POST", `/api/v1/invoices/${invoiceId}/cancel`, {});
    expect(cancelRes.status).toBe(200);
    expect((cancelRes.body as { status: string }).status).toBe("cancelled");

    const afterCancel = await request("GET", `/api/v1/invoices/${invoiceId}`);
    expect((afterCancel.body as { status: string }).status).toBe("cancelled");
  });
});
