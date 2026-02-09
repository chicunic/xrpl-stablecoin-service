import type { Timestamp } from "firebase-admin/firestore";

export type XrpTransactionType = "deposit" | "withdrawal" | "exchange_in" | "exchange_out";

export interface XrpTransaction {
  transactionId: string;
  tokenId: string;
  type: XrpTransactionType;
  amount: number;
  balance: number;
  description: string;
  relatedOrderId?: string;
  createdAt: Timestamp;
}
