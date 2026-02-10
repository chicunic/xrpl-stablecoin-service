import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import { ValidationError } from "@common/utils/error.handler.js";
import type { TokenBalance } from "@token/types/user.type.js";
import type { XrpTransaction, XrpTransactionType } from "@token/types/xrp-transaction.type.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

function tokenBalanceDocId(currency: string, issuer: string): string {
  return `${currency}:${issuer}`;
}

export async function createTokenBalanceDoc(userId: string, currency: string, issuer: string): Promise<void> {
  const db = getFirestore();
  const docId = tokenBalanceDocId(currency, issuer);
  const ref = db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").doc(docId);

  const existing = await ref.get();
  if (existing.exists) {
    return;
  }

  await ref.set({
    currency,
    issuer,
    balance: 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function creditTokenBalance(
  userId: string,
  tokenId: string,
  currency: string,
  issuer: string,
  amount: number,
  type: XrpTransactionType,
  description: string,
  relatedOrderId?: string,
): Promise<void> {
  if (amount <= 0) {
    throw new ValidationError("Invalid: amount must be positive");
  }

  const db = getFirestore();
  const transactionId = randomUUID();
  const docId = tokenBalanceDocId(currency, issuer);

  await db.runTransaction(async (tx) => {
    const balanceRef = db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").doc(docId);
    const balanceDoc = await tx.get(balanceRef);

    const currentBalance = balanceDoc.exists ? ((balanceDoc.data()?.balance as number) ?? 0) : 0;
    const newBalance = currentBalance + amount;

    if (balanceDoc.exists) {
      tx.update(balanceRef, {
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(balanceRef, {
        currency,
        issuer,
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const txRef = db.collection(USERS_COLLECTION).doc(userId).collection("xrpTransactions").doc(transactionId);
    tx.set(txRef, {
      transactionId,
      tokenId,
      type,
      amount,
      balance: newBalance,
      description,
      ...(relatedOrderId && { relatedOrderId }),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function debitTokenBalance(
  userId: string,
  tokenId: string,
  currency: string,
  issuer: string,
  amount: number,
  type: XrpTransactionType,
  description: string,
  relatedOrderId?: string,
): Promise<void> {
  if (amount <= 0) {
    throw new ValidationError("Invalid: amount must be positive");
  }

  const db = getFirestore();
  const transactionId = randomUUID();
  const docId = tokenBalanceDocId(currency, issuer);

  await db.runTransaction(async (tx) => {
    const balanceRef = db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").doc(docId);
    const balanceDoc = await tx.get(balanceRef);

    if (!balanceDoc.exists) {
      throw new ValidationError("Invalid: token balance not found");
    }

    const currentBalance = (balanceDoc.data()?.balance as number) ?? 0;
    if (currentBalance < amount) {
      throw new ValidationError("Invalid: insufficient token balance");
    }

    const newBalance = currentBalance - amount;

    tx.update(balanceRef, {
      balance: newBalance,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const txRef = db.collection(USERS_COLLECTION).doc(userId).collection("xrpTransactions").doc(transactionId);
    tx.set(txRef, {
      transactionId,
      tokenId,
      type,
      amount,
      balance: newBalance,
      description,
      ...(relatedOrderId && { relatedOrderId }),
      createdAt: FieldValue.serverTimestamp(),
    });
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

export async function getTokenBalances(userId: string): Promise<TokenBalance[]> {
  const db = getFirestore();
  const snapshot = await db.collection(USERS_COLLECTION).doc(userId).collection("tokenBalances").get();

  return snapshot.docs.map((doc) => doc.data() as TokenBalance);
}
