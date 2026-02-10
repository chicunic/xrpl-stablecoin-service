import { getFirestore } from "@common/config/firebase.js";
import { ConflictError } from "@common/utils/error.handler.js";
import { getBankAuthToken, getBankServiceUrl } from "@token/config/bank.js";
import { fundAccount } from "@token/services/faucet.service.js";
import { allocateXrpAddressIndex, deriveWallet } from "@token/services/wallet.service.js";
import type { BankAccount, User, UserResponse, Wallet } from "@token/types/user.type.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";

interface BankVirtualAccountResponse {
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  accountHolder: string;
}

async function createBankVirtualAccount(label: string): Promise<BankVirtualAccountResponse> {
  const bankServiceUrl = getBankServiceUrl();
  const bankAuthToken = await getBankAuthToken();
  const url = `${bankServiceUrl}/api/v1/accounts/me/virtual-accounts`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bankAuthToken}`,
    },
    body: JSON.stringify({ label }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create virtual account: ${response.status}`);
  }

  return (await response.json()) as BankVirtualAccountResponse;
}

export async function getOrCreateUser(uid: string, email: string, name: string): Promise<UserResponse> {
  const db = getFirestore();
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userDoc = await userRef.get();

  let user: User;
  if (userDoc.exists) {
    user = userDoc.data() as User;
  } else {
    const newUser = {
      uid,
      email,
      name,
      fiatBalance: 0,
      kycStatus: "none" as const,
      createdAt: FieldValue.serverTimestamp(),
    };
    await userRef.set(newUser);
    const created = await userRef.get();
    user = created.data() as User;
  }

  const [walletDoc, vaDoc] = await Promise.all([
    userRef.collection("wallet").doc("default").get(),
    userRef.collection("virtualAccount").doc("default").get(),
  ]);

  return {
    ...user,
    hasWallet: walletDoc.exists,
    hasVirtualAccount: vaDoc.exists,
    walletAddress: walletDoc.exists ? (walletDoc.data() as Wallet).address : undefined,
  };
}

export async function setupWallet(uid: string): Promise<Wallet> {
  const db = getFirestore();
  const walletRef = db.collection(USERS_COLLECTION).doc(uid).collection("wallet").doc("default");
  const walletDoc = await walletRef.get();

  if (walletDoc.exists) {
    throw new ConflictError("Wallet already set up");
  }

  const bipIndex = await allocateXrpAddressIndex();
  const { address } = await deriveWallet(bipIndex);

  try {
    await fundAccount(address);
  } catch (error) {
    console.warn(`Failed to fund wallet for user ${uid}:`, error);
  }

  const walletData = {
    address,
    bipIndex,
    createdAt: FieldValue.serverTimestamp(),
  };

  await walletRef.set(walletData);

  const created = await walletRef.get();
  return created.data() as Wallet;
}

export async function getVirtualAccount(uid: string): Promise<BankAccount | null> {
  const db = getFirestore();
  const vaDoc = await db.collection(USERS_COLLECTION).doc(uid).collection("virtualAccount").doc("default").get();
  if (!vaDoc.exists) {
    return null;
  }
  return vaDoc.data() as BankAccount;
}

export async function setupVirtualAccount(uid: string): Promise<BankAccount> {
  const db = getFirestore();
  const vaRef = db.collection(USERS_COLLECTION).doc(uid).collection("virtualAccount").doc("default");
  const vaDoc = await vaRef.get();

  if (vaDoc.exists) {
    throw new ConflictError("Virtual account already set up");
  }

  const bankData = await createBankVirtualAccount(`user:${uid}`);

  const vaData = {
    bankCode: bankData.bankCode,
    branchCode: bankData.branchCode,
    accountNumber: bankData.accountNumber,
    accountHolder: bankData.accountHolder,
    label: "",
    createdAt: FieldValue.serverTimestamp(),
  };

  await vaRef.set(vaData);

  const created = await vaRef.get();
  return created.data() as BankAccount;
}

export async function getUserWallet(uid: string): Promise<Wallet | null> {
  const db = getFirestore();
  const walletDoc = await db.collection(USERS_COLLECTION).doc(uid).collection("wallet").doc("default").get();

  if (!walletDoc.exists) {
    return null;
  }

  return walletDoc.data() as Wallet;
}

export async function getUserByWalletAddress(address: string): Promise<User | null> {
  const db = getFirestore();
  const snapshot = await db.collectionGroup("wallet").where("address", "==", address).limit(1).get();

  if (snapshot.empty) {
    return null;
  }

  const docRef = snapshot.docs[0]!.ref;
  const uid = docRef.parent.parent!.id;

  const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userDoc.exists) {
    return null;
  }

  return userDoc.data() as User;
}

export async function getUserByVirtualAccountNumber(accountNumber: string): Promise<User | null> {
  const db = getFirestore();
  const snapshot = await db
    .collectionGroup("virtualAccount")
    .where("accountNumber", "==", accountNumber)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const docRef = snapshot.docs[0]!.ref;
  const uid = docRef.parent.parent!.id;

  const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (!userDoc.exists) {
    return null;
  }

  return userDoc.data() as User;
}
