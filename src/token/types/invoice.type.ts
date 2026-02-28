import type { Timestamp } from "firebase-admin/firestore";

export type InvoiceStatus = "pending" | "paid" | "failed" | "cancelled";

export type InvoiceType = "send" | "pay";

export interface Invoice {
  invoiceId: string;
  userId: string;
  type: InvoiceType;
  tokenId: string;
  amount: number;
  recipientAddress: string;
  recipientName: string;
  description: string;
  dueDate?: Timestamp;
  status: InvoiceStatus;
  xrplTxHash?: string;
  failureReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paidAt?: Timestamp;
  paymentId?: string;
}
