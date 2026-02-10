import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import type { FiatTransaction, FiatTransactionType } from "@token/types/fiat-transaction.type.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

export async function getFiatBalance(userId: string): Promise<number> {
  const db = getFirestore();
  const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();

  if (!userDoc.exists) {
    throw new NotFoundError("User not found");
  }

  return (userDoc.data()?.fiatBalance as number) ?? 0;
}

async function executeFiatTransaction(
  userId: string,
  amount: number,
  direction: "credit" | "debit",
  type: FiatTransactionType,
  description: string,
  relatedOrderId?: string,
): Promise<FiatTransaction> {
  if (amount <= 0) {
    throw new ValidationError("Invalid: amount must be positive");
  }

  const db = getFirestore();
  const transactionId = randomUUID();

  await db.runTransaction(async (tx) => {
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userDoc = await tx.get(userRef);

    if (!userDoc.exists) {
      throw new NotFoundError("User not found");
    }

    const currentBalance = (userDoc.data()?.fiatBalance as number) ?? 0;

    if (direction === "debit" && currentBalance < amount) {
      throw new ValidationError("Invalid: insufficient fiat balance");
    }

    const newBalance = direction === "credit" ? currentBalance + amount : currentBalance - amount;

    tx.update(userRef, { fiatBalance: newBalance });

    const txRef = userRef.collection("fiatTransactions").doc(transactionId);
    tx.set(txRef, {
      transactionId,
      type,
      amount,
      balance: newBalance,
      description,
      ...(relatedOrderId && { relatedOrderId }),
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  const txDoc = await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection("fiatTransactions")
    .doc(transactionId)
    .get();
  return txDoc.data() as FiatTransaction;
}

export async function creditFiat(
  userId: string,
  amount: number,
  type: FiatTransactionType,
  description: string,
  relatedOrderId?: string,
): Promise<FiatTransaction> {
  return executeFiatTransaction(userId, amount, "credit", type, description, relatedOrderId);
}

export async function debitFiat(
  userId: string,
  amount: number,
  type: FiatTransactionType,
  description: string,
  relatedOrderId?: string,
): Promise<FiatTransaction> {
  return executeFiatTransaction(userId, amount, "debit", type, description, relatedOrderId);
}

export async function getFiatTransactions(userId: string): Promise<FiatTransaction[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection("fiatTransactions")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as FiatTransaction);
}
