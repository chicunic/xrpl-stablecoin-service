import { randomUUID } from "node:crypto";
import { getAccountById } from "@bank/services/account.service.js";
import type { BankVirtualAccountData } from "@bank/types/bank-virtual-account.type.js";
import { getFirestore } from "@common/config/firebase.js";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { FieldValue } from "firebase-admin/firestore";

const BANK_VIRTUAL_ACCOUNTS_COLLECTION = "bank_virtual_accounts";

async function allocateVirtualAccountNumber(parentAccountNumber: string): Promise<string> {
  const corporatePrefix = parentAccountNumber.substring(0, 3);
  const db = getFirestore();
  const counterRef = db.collection("bank_counters").doc(`virtualAccount:${corporatePrefix}`);

  const result = await db.runTransaction(async (tx) => {
    const counterDoc = await tx.get(counterRef);
    const current = counterDoc.exists ? (counterDoc.data()?.value as number) : 0;
    const next = current + 1;
    if (next > 9999) {
      throw new ValidationError("Invalid: virtual account number range exceeded");
    }
    tx.set(counterRef, { value: next });
    return next;
  });

  return `${corporatePrefix}${result.toString().padStart(4, "0")}`;
}

export async function createVirtualAccount(parentAccountId: string, label: string): Promise<BankVirtualAccountData> {
  const parentAccount = await getAccountById(parentAccountId);
  if (!parentAccount) {
    throw new NotFoundError("Account not found");
  }
  if (parentAccount.accountType !== "corporate") {
    throw new ValidationError("Invalid: only corporate accounts can create virtual accounts");
  }

  const db = getFirestore();
  const virtualAccountId = randomUUID();
  const accountNumber = await allocateVirtualAccountNumber(parentAccount.accountNumber);

  const virtualAccount = {
    virtualAccountId,
    accountNumber,
    bankCode: parentAccount.bankCode,
    branchCode: parentAccount.branchCode,
    accountHolder: parentAccount.accountHolder,
    parentAccountId,
    parentAccountNumber: parentAccount.accountNumber,
    label,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection(BANK_VIRTUAL_ACCOUNTS_COLLECTION).doc(virtualAccountId).set(virtualAccount);

  const created = await db.collection(BANK_VIRTUAL_ACCOUNTS_COLLECTION).doc(virtualAccountId).get();
  return created.data() as BankVirtualAccountData;
}

export async function listVirtualAccounts(parentAccountId: string): Promise<BankVirtualAccountData[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(BANK_VIRTUAL_ACCOUNTS_COLLECTION)
    .where("parentAccountId", "==", parentAccountId)
    .get();

  return snapshot.docs.map((doc) => doc.data() as BankVirtualAccountData);
}

export async function getVirtualAccountById(virtualAccountId: string): Promise<BankVirtualAccountData | null> {
  const db = getFirestore();
  const doc = await db.collection(BANK_VIRTUAL_ACCOUNTS_COLLECTION).doc(virtualAccountId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as BankVirtualAccountData;
}

export async function updateVirtualAccount(
  virtualAccountId: string,
  updates: { label?: string; isActive?: boolean },
): Promise<BankVirtualAccountData> {
  const db = getFirestore();
  const docRef = db.collection(BANK_VIRTUAL_ACCOUNTS_COLLECTION).doc(virtualAccountId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new NotFoundError("Virtual account not found");
  }

  const updateData: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (updates.label !== undefined) {
    updateData.label = updates.label;
  }
  if (updates.isActive !== undefined) {
    updateData.isActive = updates.isActive;
  }

  await docRef.update(updateData);

  const updated = await docRef.get();
  return updated.data() as BankVirtualAccountData;
}

export async function getVirtualAccountByBranchAndNumber(
  branchCode: string,
  accountNumber: string,
): Promise<BankVirtualAccountData | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection(BANK_VIRTUAL_ACCOUNTS_COLLECTION)
    .where("branchCode", "==", branchCode)
    .where("accountNumber", "==", accountNumber)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0]?.data() as BankVirtualAccountData;
}
