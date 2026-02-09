import type { Timestamp } from "firebase-admin/firestore";

export type ExchangeDirection = "fiat_to_token" | "token_to_fiat";

export type ExchangeOrderStatus = "pending" | "fiat_debited" | "token_burned" | "completed" | "failed";

export interface ExchangeOrder {
  orderId: string;
  userId: string;
  tokenId: string;
  direction: ExchangeDirection;
  amount: number;
  status: ExchangeOrderStatus;
  xrplTxHash?: string;
  failureReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
