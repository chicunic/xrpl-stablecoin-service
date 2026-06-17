/**
 * Helpers for flow integration tests: seed the real Firestore emulator with the
 * user/wallet docs the token endpoints expect, and build the auth claims that the
 * mocked `verifySessionCookie` should return.
 *
 * Auth is mocked (Firebase Auth cookie verification can't run offline), but Firestore
 * is the real emulator and the XRPL ledger is real localnet — see test-strategy.md.
 *
 * Each flow test must hoist its own `vi.mock("firebase-admin/auth", ...)`; this module
 * only provides the claims factory + Firestore seeding, never the mock itself.
 */
import { getFirestore, initializeFirebase } from "@common/config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

/** Initialize firebase-admin against the emulator exactly once for the test process. */
let initialized = false;
export function ensureFirebase(): void {
  if (!initialized) {
    initializeFirebase();
    initialized = true;
  }
}

export interface AuthClaimsOptions {
  uid: string;
  email?: string;
  name?: string;
  /** When true, the decoded token carries kycStatus=approved (passes requireKyc). */
  kycApproved?: boolean;
  /** When true, the decoded token carries a second-factor sign-in (passes requireMfa). */
  mfa?: boolean;
}

/** Build the decoded-session claims object that the mocked verifySessionCookie returns. */
export function buildClaims(opts: AuthClaimsOptions): Record<string, unknown> {
  return {
    uid: opts.uid,
    email: opts.email ?? `${opts.uid}@example.com`,
    name: opts.name ?? "Flow Test User",
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    firebase: opts.mfa === false ? {} : { sign_in_second_factor: "phone" },
    ...(opts.kycApproved === false ? {} : { kycStatus: "approved" }),
  };
}

/** Write a token_users/{uid} document with the given starting fiat balance. */
export async function seedUser(uid: string, fiatBalance = 0): Promise<void> {
  ensureFirebase();
  await getFirestore()
    .collection(USERS_COLLECTION)
    .doc(uid)
    .set({
      uid,
      email: `${uid}@example.com`,
      name: "Flow Test User",
      fiatBalance,
      kycStatus: "approved",
      createdAt: FieldValue.serverTimestamp(),
    });
}

/** Write the user's custodial wallet doc (token_users/{uid}/wallet/default). */
export async function seedWallet(uid: string, address: string, bipIndex: number): Promise<void> {
  ensureFirebase();
  await getFirestore()
    .collection(USERS_COLLECTION)
    .doc(uid)
    .collection("wallet")
    .doc("default")
    .set({ address, bipIndex, createdAt: FieldValue.serverTimestamp() });
}

/** Write the user's virtual bank account doc (token_users/{uid}/virtualAccount/default). */
export async function seedVirtualAccount(
  uid: string,
  account: { bankCode: string; branchCode: string; accountNumber: string; accountHolder: string },
): Promise<void> {
  ensureFirebase();
  await getFirestore()
    .collection(USERS_COLLECTION)
    .doc(uid)
    .collection("virtualAccount")
    .doc("default")
    .set({ ...account, label: "", createdAt: FieldValue.serverTimestamp() });
}

/** Read back the user's current fiat balance from the emulator. */
export async function readFiatBalance(uid: string): Promise<number> {
  ensureFirebase();
  const doc = await getFirestore().collection(USERS_COLLECTION).doc(uid).get();
  return (doc.data()?.fiatBalance as number | undefined) ?? 0;
}
