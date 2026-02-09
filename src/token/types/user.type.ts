import type { Timestamp } from "firebase-admin/firestore";

export interface BankAccount {
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  accountHolder: string;
  label: string;
  createdAt: Timestamp;
}

export interface Wallet {
  address: string;
  bipIndex: number;
  createdAt: Timestamp;
}

export interface WhitelistAddress {
  address: string;
  label: string;
  createdAt: Timestamp;
}

export interface TokenBalance {
  currency: string;
  issuer: string;
  balance: number;
  updatedAt: Timestamp;
}

export interface User {
  uid: string;
  email: string;
  name: string;
  fiatBalance: number;
  createdAt: Timestamp;
}
