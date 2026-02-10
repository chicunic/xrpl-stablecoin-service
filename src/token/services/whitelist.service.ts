import { getFirestore } from "@common/config/firebase.js";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import type { BankAccount, WhitelistAddress } from "@token/types/user.type.js";
import type { DocumentReference, DocumentSnapshot } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

function whitelistDocRef(userId: string, subcollection: string): DocumentReference {
  return getFirestore().collection(USERS_COLLECTION).doc(userId).collection(subcollection).doc("default");
}

function extractArray<T>(doc: DocumentSnapshot, field: string): T[] {
  if (!doc.exists) {
    return [];
  }
  return (doc.data()?.[field] as T[]) ?? [];
}

export async function addXrpWhitelist(userId: string, address: string, label: string): Promise<WhitelistAddress> {
  const docRef = whitelistDocRef(userId, "xrpWhitelist");
  const addresses = extractArray<WhitelistAddress>(await docRef.get(), "addresses");

  if (addresses.some((w) => w.address === address)) {
    throw new ValidationError("Invalid: address already in whitelist");
  }

  const entry: WhitelistAddress = { address, label, createdAt: Timestamp.now() };
  addresses.push(entry);
  await docRef.set({ addresses }, { merge: true });

  return entry;
}

export async function removeXrpWhitelist(userId: string, address: string): Promise<void> {
  const docRef = whitelistDocRef(userId, "xrpWhitelist");
  const addresses = extractArray<WhitelistAddress>(await docRef.get(), "addresses");
  const idx = addresses.findIndex((w) => w.address === address);

  if (idx === -1) {
    throw new NotFoundError("Not found: address not in whitelist");
  }

  addresses.splice(idx, 1);
  await docRef.set({ addresses }, { merge: true });
}

export async function getXrpWhitelist(userId: string): Promise<WhitelistAddress[]> {
  return extractArray<WhitelistAddress>(await whitelistDocRef(userId, "xrpWhitelist").get(), "addresses");
}

export function isXrpWhitelisted(whitelist: WhitelistAddress[], address: string): boolean {
  return whitelist.some((w) => w.address === address);
}

export async function addBankWhitelist(
  userId: string,
  bankAccount: Omit<BankAccount, "createdAt">,
): Promise<BankAccount> {
  const docRef = whitelistDocRef(userId, "bankWhitelist");
  const accounts = extractArray<BankAccount>(await docRef.get(), "accounts");

  if (accounts.some((w) => w.branchCode === bankAccount.branchCode && w.accountNumber === bankAccount.accountNumber)) {
    throw new ValidationError("Invalid: bank account already in whitelist");
  }

  const entry: BankAccount = { ...bankAccount, createdAt: Timestamp.now() };
  accounts.push(entry);
  await docRef.set({ accounts }, { merge: true });

  return entry;
}

export async function removeBankWhitelist(userId: string, branchCode: string, accountNumber: string): Promise<void> {
  const docRef = whitelistDocRef(userId, "bankWhitelist");
  const accounts = extractArray<BankAccount>(await docRef.get(), "accounts");
  const idx = accounts.findIndex((w) => w.branchCode === branchCode && w.accountNumber === accountNumber);

  if (idx === -1) {
    throw new NotFoundError("Not found: bank account not in whitelist");
  }

  accounts.splice(idx, 1);
  await docRef.set({ accounts }, { merge: true });
}

export async function getBankWhitelist(userId: string): Promise<BankAccount[]> {
  return extractArray<BankAccount>(await whitelistDocRef(userId, "bankWhitelist").get(), "accounts");
}

export function isBankWhitelisted(whitelist: BankAccount[], branchCode: string, accountNumber: string): boolean {
  return whitelist.some((w) => w.branchCode === branchCode && w.accountNumber === accountNumber);
}
