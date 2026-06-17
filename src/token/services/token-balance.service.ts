import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import type { MptAuthorization } from "@token/types/user.type.js";
import type { MptTransaction, MptTransactionType } from "@token/types/mpt-transaction.type.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

function mptDocId(mptIssuanceId: string): string {
  return mptIssuanceId;
}

export async function createAuthorizationDoc(userId: string, mptIssuanceId: string): Promise<void> {
  const db = getFirestore();
  const docId = mptDocId(mptIssuanceId);
  const ref = db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").doc(docId);

  const existing = await ref.get();
  if (existing.exists) {
    return;
  }

  await ref.set({
    mptIssuanceId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function recordMptTransaction(
  userId: string,
  tokenId: string,
  type: MptTransactionType,
  amount: number,
  description: string,
  txHash: string,
  relatedOrderId?: string,
): Promise<void> {
  const db = getFirestore();
  const transactionId = randomUUID();
  const txRef = db.collection(USERS_COLLECTION).doc(userId).collection("xrpTransactions").doc(transactionId);

  await txRef.set({
    transactionId,
    tokenId,
    type,
    amount,
    description,
    txHash,
    ...(relatedOrderId && { relatedOrderId }),
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function getMptTransactions(userId: string): Promise<MptTransaction[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection("xrpTransactions")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as MptTransaction);
}

export async function getAuthorizations(userId: string): Promise<MptAuthorization[]> {
  const db = getFirestore();
  const snapshot = await db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").get();

  return snapshot.docs.map((doc) => doc.data() as MptAuthorization);
}
