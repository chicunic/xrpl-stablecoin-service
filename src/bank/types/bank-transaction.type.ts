import type { Timestamp } from "firebase-admin/firestore";

export type BankTransactionType = "atm_in" | "atm_out" | "transfer_in" | "transfer_out";

export interface Counterparty {
  bankCode: string;
  branchCode: string;
  accountNumber: string;
  accountHolder: string;
}

export interface BankTransaction {
  transactionId: string;
  accountId: string;
  type: BankTransactionType;
  amount: number;
  balance: number;
  counterparty: Counterparty | null;
  sequenceNumber: number;
  description: string;
  virtualAccountNumber?: string;
  virtualAccountLabel?: string;
  createdAt: Timestamp;
}
