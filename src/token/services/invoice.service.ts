import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { recordXrpTransaction } from "@token/services/token-balance.service.js";
import { getXrpWhitelist, isXrpWhitelisted } from "@token/services/whitelist.service.js";
import { sendTokenFromUser } from "@token/services/xrpl.service.js";
import type { Invoice, InvoiceType } from "@token/types/invoice.type.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const INVOICES_COLLECTION = "token_invoices";

interface CreateInvoiceData {
  type: InvoiceType;
  tokenId: string;
  amount: number;
  recipientAddress: string;
  recipientName: string;
  description: string;
  dueDate?: string;
}

export async function createInvoice(userId: string, data: CreateInvoiceData): Promise<Invoice> {
  getTokenConfig(data.tokenId);

  if (data.amount <= 0) {
    throw new ValidationError("Invalid: amount must be positive");
  }

  const db = getFirestore();
  const invoiceId = randomUUID();
  const ref = db.collection(INVOICES_COLLECTION).doc(invoiceId);

  const invoice = {
    invoiceId,
    userId,
    type: data.type,
    tokenId: data.tokenId,
    amount: data.amount,
    recipientAddress: data.recipientAddress,
    recipientName: data.recipientName,
    description: data.description,
    ...(data.dueDate && { dueDate: Timestamp.fromDate(new Date(data.dueDate)) }),
    status: "draft" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await ref.set(invoice);

  const created = await ref.get();
  return created.data() as Invoice;
}

export async function payInvoice(userId: string, invoiceId: string): Promise<Invoice> {
  const db = getFirestore();
  const ref = db.collection(INVOICES_COLLECTION).doc(invoiceId);
  const doc = await ref.get();

  if (!doc.exists) {
    throw new NotFoundError("Invoice not found");
  }

  const invoice = doc.data() as Invoice;

  if (invoice.userId !== userId) {
    throw new NotFoundError("Invoice not found");
  }

  if (invoice.status !== "draft") {
    throw new ValidationError(`Invalid: invoice status is ${invoice.status}, expected draft`);
  }

  const wallet = await getUserWallet(userId);
  if (!wallet) {
    throw new NotFoundError("Wallet not set up");
  }

  const whitelist = await getXrpWhitelist(userId);
  if (!isXrpWhitelisted(whitelist, invoice.recipientAddress)) {
    throw new ValidationError("Invalid: recipient address is not in whitelist");
  }

  const tokenConfig = getTokenConfig(invoice.tokenId);

  await ref.update({
    status: "pending",
    updatedAt: FieldValue.serverTimestamp(),
  });

  let txHash: string;
  try {
    txHash = await sendTokenFromUser(
      wallet.bipIndex,
      wallet.address,
      invoice.recipientAddress,
      tokenConfig.currency,
      invoice.amount.toString(),
      tokenConfig.issuerAddress,
    );
  } catch (error) {
    await ref.update({
      status: "failed",
      failureReason: error instanceof Error ? error.message : "Unknown error",
      updatedAt: FieldValue.serverTimestamp(),
    });
    const failed = await ref.get();
    return failed.data() as Invoice;
  }

  await ref.update({
    status: "paid",
    xrplTxHash: txHash,
    paidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    await recordXrpTransaction(
      userId,
      invoice.tokenId,
      "invoice_payment",
      invoice.amount,
      `${tokenConfig.currency} 請求書支払`,
      txHash,
      invoiceId,
    );
  } catch (recordError) {
    console.error(
      `CRITICAL: Invoice payment succeeded (txHash=${txHash}) but record failed for user ${userId}:`,
      recordError,
    );
    try {
      await recordXrpTransaction(
        userId,
        invoice.tokenId,
        "invoice_payment",
        invoice.amount,
        `${tokenConfig.currency} 請求書支払`,
        txHash,
        invoiceId,
      );
    } catch (retryError) {
      console.error(
        `CRITICAL: Retry also failed for txHash=${txHash}, user=${userId}. Manual reconciliation required.`,
        retryError,
      );
    }
  }

  const paid = await ref.get();
  return paid.data() as Invoice;
}

export async function cancelInvoice(userId: string, invoiceId: string): Promise<Invoice> {
  const db = getFirestore();
  const ref = db.collection(INVOICES_COLLECTION).doc(invoiceId);
  const doc = await ref.get();

  if (!doc.exists) {
    throw new NotFoundError("Invoice not found");
  }

  const invoice = doc.data() as Invoice;

  if (invoice.userId !== userId) {
    throw new NotFoundError("Invoice not found");
  }

  if (invoice.status !== "draft") {
    throw new ValidationError(`Invalid: invoice status is ${invoice.status}, expected draft`);
  }

  await ref.update({
    status: "cancelled",
    updatedAt: FieldValue.serverTimestamp(),
  });

  const cancelled = await ref.get();
  return cancelled.data() as Invoice;
}

export async function getInvoice(userId: string, invoiceId: string): Promise<Invoice> {
  const db = getFirestore();
  const doc = await db.collection(INVOICES_COLLECTION).doc(invoiceId).get();

  if (!doc.exists) {
    throw new NotFoundError("Invoice not found");
  }

  const invoice = doc.data() as Invoice;

  if (invoice.userId !== userId) {
    throw new NotFoundError("Invoice not found");
  }

  return invoice;
}

export async function listInvoices(userId: string, type?: InvoiceType): Promise<Invoice[]> {
  const db = getFirestore();
  let query = db.collection(INVOICES_COLLECTION).where("userId", "==", userId) as FirebaseFirestore.Query;

  if (type) {
    query = query.where("type", "==", type);
  }

  const snapshot = await query.orderBy("createdAt", "desc").get();
  return snapshot.docs.map((doc) => doc.data() as Invoice);
}
