import type { Timestamp } from "firebase-admin/firestore";

export type InvoiceStatus = "draft" | "pending" | "paid" | "failed" | "cancelled";

export type InvoiceType = "issued" | "received";

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
}
