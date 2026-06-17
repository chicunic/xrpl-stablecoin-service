import { randomUUID } from "node:crypto";
import type { BankAccountData } from "@bank/types/bank-account.type.js";
import type { BankVirtualAccountData } from "@bank/types/bank-virtual-account.type.js";
import { getFirestore } from "@common/config/firebase.js";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { incrementCounter } from "@common/utils/firestore.js";
import { FieldValue } from "firebase-admin/firestore";

const BANK_ACCOUNTS_COLLECTION = "bank_accounts";
const BANK_VIRTUAL_ACCOUNTS_COLLECTION = "bank_virtual_accounts";
const BANK_COUNTERS_COLLECTION = "bank_counters";

function omitPin(account: BankAccountData): Omit<BankAccountData, "pin"> {
  const { pin: _pin, ...safe } = account;
  return safe;
}

async function allocatePersonalAccountNumber(): Promise<string> {
  const seq = await incrementCounter(BANK_COUNTERS_COLLECTION, "personalAccountNumber");
  return seq.toString().padStart(7, "0");
}

async function allocateCorporateAccountNumber(): Promise<string> {
  const seq = await incrementCounter(BANK_COUNTERS_COLLECTION, "corporateAccountNumber", 999);
  return `${seq.toString().padStart(3, "0")}0000`;
}

export async function createAccount(
  pin: string,
  accountHolder: string,
  accountType: "personal" | "corporate" = "personal",
): Promise<Omit<BankAccountData, "pin">> {
  const db = getFirestore();

  const accountId = randomUUID();

  const branchCode = accountType === "corporate" ? "001" : "002";
  const accountNumber =
    accountType === "corporate" ? await allocateCorporateAccountNumber() : await allocatePersonalAccountNumber();

  const account = {
    accountId,
    accountNumber,
    accountType,
    accountHolder,
    bankCode: "9999",
    branchCode,
    balance: 0,
    transactionSequence: 0,
    pin,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection(BANK_ACCOUNTS_COLLECTION).doc(accountId).set(account);

  const created = await db.collection(BANK_ACCOUNTS_COLLECTION).doc(accountId).get();
  return omitPin(created.data() as BankAccountData);
}

export async function login(branchCode: string, accountNumber: string, pin: string): Promise<BankAccountData> {
  const account = await getAccountByBranchAndNumber(branchCode, accountNumber);

  if (account?.pin !== pin) {
    throw new ValidationError("Invalid credentials");
  }

  return account;
}

export async function getAccountById(accountId: string): Promise<BankAccountData | null> {
  const db = getFirestore();
  const doc = await db.collection(BANK_ACCOUNTS_COLLECTION).doc(accountId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as BankAccountData;
}

export async function getAccountByBranchAndNumber(
  branchCode: string,
  accountNumber: string,
): Promise<BankAccountData | null> {
  const db = getFirestore();
  const snapshot = await db
    .collection(BANK_ACCOUNTS_COLLECTION)
    .where("branchCode", "==", branchCode)
    .where("accountNumber", "==", accountNumber)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0]?.data() as BankAccountData;
}

export async function verifyPin(accountId: string, pin: string): Promise<void> {
  const account = await getAccountById(accountId);
  if (!account) {
    throw new NotFoundError("Account not found");
  }
  if (account.pin !== pin) {
    throw new ValidationError("Invalid: incorrect PIN");
  }
}

export async function updateBalance(accountId: string, newBalance: number): Promise<void> {
  const db = getFirestore();
  await db.collection(BANK_ACCOUNTS_COLLECTION).doc(accountId).update({
    balance: newBalance,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function lookupAccount(
  branchCode: string,
  accountNumber: string,
): Promise<{
  accountHolder: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  isVirtualAccount?: boolean;
  parentAccountNumber?: string;
  label?: string;
} | null> {
  const account = await getAccountByBranchAndNumber(branchCode, accountNumber);
  if (account) {
    return {
      accountHolder: account.accountHolder,
      bankCode: account.bankCode,
      branchCode: account.branchCode,
      accountNumber: account.accountNumber,
    };
  }

  const db = getFirestore();
  const virtualSnapshot = await db
    .collection(BANK_VIRTUAL_ACCOUNTS_COLLECTION)
    .where("branchCode", "==", branchCode)
    .where("accountNumber", "==", accountNumber)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (virtualSnapshot.empty) {
    return null;
  }

  const virtualAccount = virtualSnapshot.docs[0]?.data() as BankVirtualAccountData;
  const parentDoc = await db.collection(BANK_ACCOUNTS_COLLECTION).doc(virtualAccount.parentAccountId).get();
  if (!parentDoc.exists) {
    return null;
  }
  const parentAccount = parentDoc.data() as BankAccountData;

  return {
    accountHolder: parentAccount.accountHolder,
    bankCode: parentAccount.bankCode,
    branchCode: virtualAccount.branchCode,
    accountNumber: virtualAccount.accountNumber,
    isVirtualAccount: true,
    parentAccountNumber: virtualAccount.parentAccountNumber,
    label: virtualAccount.label,
  };
}

export async function updateAccount(
  accountId: string,
  updates: { accountHolder?: string; pubsubEnabled?: boolean },
): Promise<Omit<BankAccountData, "pin">> {
  const db = getFirestore();
  const docRef = db.collection(BANK_ACCOUNTS_COLLECTION).doc(accountId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new NotFoundError("Account not found");
  }

  const updateData: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (updates.accountHolder !== undefined) {
    updateData.accountHolder = updates.accountHolder;
  }
  if (updates.pubsubEnabled !== undefined) {
    updateData.pubsubEnabled = updates.pubsubEnabled;
  }

  await docRef.update(updateData);

  const updated = await docRef.get();
  return omitPin(updated.data() as BankAccountData);
}

export async function changePin(accountId: string, oldPin: string, newPin: string): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(BANK_ACCOUNTS_COLLECTION).doc(accountId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new NotFoundError("Account not found");
  }

  const account = doc.data() as BankAccountData;
  if (account.pin !== oldPin) {
    throw new ValidationError("Invalid: incorrect PIN");
  }

  await docRef.update({
    pin: newPin,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
