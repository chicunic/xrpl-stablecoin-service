import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import type { Trustline } from "@token/types/user.type.js";
import type { XrpTransaction, XrpTransactionType } from "@token/types/xrp-transaction.type.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

function trustlineDocId(currency: string, issuer: string): string {
  return `${currency}:${issuer}`;
}

export async function createTrustlineDoc(userId: string, currency: string, issuer: string): Promise<void> {
  const db = getFirestore();
  const docId = trustlineDocId(currency, issuer);
  const ref = db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").doc(docId);

  const existing = await ref.get();
  if (existing.exists) {
    return;
  }

  await ref.set({
    currency,
    issuer,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function recordXrpTransaction(
  userId: string,
  tokenId: string,
  type: XrpTransactionType,
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

export async function getXrpTransactions(userId: string): Promise<XrpTransaction[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection("xrpTransactions")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as XrpTransaction);
}

export async function getTrustlines(userId: string): Promise<Trustline[]> {
  const db = getFirestore();
  const snapshot = await db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").get();

  return snapshot.docs.map((doc) => doc.data() as Trustline);
}
