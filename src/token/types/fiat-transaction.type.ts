import type { Timestamp } from "firebase-admin/firestore";

export type FiatTransactionType = "deposit" | "withdrawal" | "exchange_in" | "exchange_out" | "refund";

export interface FiatTransaction {
  transactionId: string;
  type: FiatTransactionType;
  amount: number;
  balance: number;
  description: string;
  relatedOrderId?: string;
  createdAt: Timestamp;
}
