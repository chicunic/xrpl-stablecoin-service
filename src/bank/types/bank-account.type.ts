import type { Timestamp } from "firebase-admin/firestore";

export interface BankAccountData {
  accountId: string;
  accountNumber: string;
  accountType: "personal" | "corporate";
  accountHolder: string;
  bankCode: string;
  branchCode: string;
  balance: number;
  transactionSequence: number;
  pin: string;
  pubsubEnabled?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
