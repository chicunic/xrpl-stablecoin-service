import type { Timestamp } from "firebase-admin/firestore";

export interface BankVirtualAccountData {
  virtualAccountId: string;
  accountNumber: string;
  bankCode: string;
  branchCode: string;
  accountHolder: string;
  parentAccountId: string;
  parentAccountNumber: string;
  label: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
