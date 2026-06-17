import type { Timestamp } from "firebase-admin/firestore";

export type MptTransactionType = "deposit" | "withdrawal" | "exchange_in" | "exchange_out" | "invoice_payment";

export interface MptTransaction {
  transactionId: string;
  tokenId: string;
  type: MptTransactionType;
  amount: number;
  description: string;
  relatedOrderId?: string;
  txHash?: string;
  createdAt: Timestamp;
}
