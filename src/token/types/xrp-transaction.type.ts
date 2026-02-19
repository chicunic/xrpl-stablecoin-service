import type { Timestamp } from "firebase-admin/firestore";

export type XrpTransactionType = "deposit" | "withdrawal" | "exchange_in" | "exchange_out" | "invoice_payment";

export interface XrpTransaction {
  transactionId: string;
  tokenId: string;
  type: XrpTransactionType;
  amount: number;
  description: string;
  relatedOrderId?: string;
  txHash?: string;
  createdAt: Timestamp;
}
