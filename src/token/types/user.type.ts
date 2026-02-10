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

export interface Trustline {
  currency: string;
  issuer: string;
  createdAt: Timestamp;
}

export type KycStatus = "none" | "approved";

export interface KycInfo {
  fullName: string;
  phoneNumber: string;
  postalCode: string;
  prefecture: string;
  city: string;
  town: string;
  address: string;
  status: KycStatus;
  submittedAt: Timestamp;
}

export interface User {
  uid: string;
  email: string;
  name: string;
  fiatBalance: number;
  kycStatus: KycStatus;
  createdAt: Timestamp;
}

export interface UserResponse extends User {
  hasWallet: boolean;
  hasVirtualAccount: boolean;
  walletAddress?: string;
}
