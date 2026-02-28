import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { recordXrpTransaction } from "@token/services/token-balance.service.js";
import { getXrpWhitelist, isXrpWhitelisted } from "@token/services/whitelist.service.js";
import { sendTokenFromUser } from "@token/services/xrpl.service.js";
import type { Invoice, InvoiceType } from "@token/types/invoice.type.js";
import type { DocumentReference } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const INVOICES_COLLECTION = "token_invoices";

export interface InvoiceData {
  tokenId: string;
  amount: number;
  recipientAddress: string;
  recipientName: string;
  description: string;
  dueDate?: string;
  invoiceId?: string;
}

function invoiceRef(docId: string): DocumentReference {
  return getFirestore().collection(INVOICES_COLLECTION).doc(docId);
}

async function fetchInvoice(ref: DocumentReference): Promise<Invoice> {
  const doc = await ref.get();
  return doc.data() as Invoice;
}

async function fetchUserInvoice(
  userId: string,
  invoiceId: string,
): Promise<{ ref: DocumentReference; invoice: Invoice }> {
  const ref = invoiceRef(invoiceId);
  const doc = await ref.get();

  if (!doc.exists) {
    throw new NotFoundError("Invoice not found");
  }

  const invoice = doc.data() as Invoice;

  if (invoice.userId !== userId) {
    throw new NotFoundError("Invoice not found");
  }

  return { ref, invoice };
}

function buildDueDateField(dueDate?: string): { dueDate: Timestamp } | Record<string, never> {
  if (!dueDate) return {};
  return { dueDate: Timestamp.fromDate(new Date(dueDate)) };
}

/** Send an invoice to someone (issued) -- just records it, no payment */
export async function sendInvoice(userId: string, data: InvoiceData): Promise<Invoice> {
  getTokenConfig(data.tokenId);

  if (data.amount <= 0) {
    throw new ValidationError("Invalid: amount must be positive");
  }

  const wallet = await getUserWallet(userId);
  if (!wallet) {
    throw new NotFoundError("Wallet not set up");
  }
  if (data.recipientAddress !== wallet.address) {
    throw new ValidationError("Invalid: recipientAddress must be your own wallet address");
  }

  const invoiceId = randomUUID();
  const ref = invoiceRef(invoiceId);

  await ref.set({
    invoiceId,
    userId,
    type: "send",
    tokenId: data.tokenId,
    amount: data.amount,
    recipientAddress: data.recipientAddress,
    recipientName: data.recipientName,
    description: data.description,
    ...buildDueDateField(data.dueDate),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return fetchInvoice(ref);
}

/** Pay an invoice received from someone -- executes payment immediately */
export async function payInvoice(userId: string, data: InvoiceData): Promise<Invoice> {
  const tokenConfig = getTokenConfig(data.tokenId);

  if (data.amount <= 0) {
    throw new ValidationError("Invalid: amount must be positive");
  }

  const wallet = await getUserWallet(userId);
  if (!wallet) {
    throw new NotFoundError("Wallet not set up");
  }

  const whitelist = await getXrpWhitelist(userId);
  if (!isXrpWhitelisted(whitelist, data.recipientAddress)) {
    throw new ValidationError("Invalid: recipient address is not in whitelist");
  }

  const invoiceId = data.invoiceId ?? randomUUID();
  const paymentId = randomUUID();

  if (data.invoiceId) {
    const existing = await getFirestore()
      .collection(INVOICES_COLLECTION)
      .where("userId", "==", userId)
      .where("type", "==", "pay")
      .where("invoiceId", "==", data.invoiceId)
      .where("status", "==", "paid")
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new ValidationError("Invoice already paid");
    }
  }

  const ref = invoiceRef(paymentId);

  await ref.set({
    paymentId,
    invoiceId,
    userId,
    type: "pay",
    tokenId: data.tokenId,
    amount: data.amount,
    recipientAddress: data.recipientAddress,
    recipientName: data.recipientName,
    description: data.description,
    ...buildDueDateField(data.dueDate),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  let txHash: string;
  try {
    txHash = await sendTokenFromUser(
      wallet.bipIndex,
      wallet.address,
      data.recipientAddress,
      tokenConfig.currency,
      data.amount.toString(),
      tokenConfig.issuerAddress,
    );
  } catch (error) {
    await ref.update({
      status: "failed",
      failureReason: error instanceof Error ? error.message : "Unknown error",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return fetchInvoice(ref);
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
      data.tokenId,
      "invoice_payment",
      data.amount,
      `${tokenConfig.currency} 請求書支払`,
      txHash,
      paymentId,
    );
  } catch (recordError) {
    console.error(
      `CRITICAL: Invoice payment succeeded (txHash=${txHash}) but record failed for user ${userId}:`,
      recordError,
    );
  }

  return fetchInvoice(ref);
}

export async function cancelInvoice(userId: string, invoiceId: string): Promise<Invoice> {
  const { ref, invoice } = await fetchUserInvoice(userId, invoiceId);

  if (invoice.status !== "pending") {
    throw new ValidationError(`Invalid: invoice status is ${invoice.status}, expected pending`);
  }

  await ref.update({
    status: "cancelled",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return fetchInvoice(ref);
}

export async function getInvoice(userId: string, invoiceId: string): Promise<Invoice> {
  const { invoice } = await fetchUserInvoice(userId, invoiceId);
  return invoice;
}

export async function listInvoices(userId: string, type?: InvoiceType): Promise<Invoice[]> {
  const db = getFirestore();
  let query = db.collection(INVOICES_COLLECTION).where("userId", "==", userId);

  if (type) {
    query = query.where("type", "==", type);
  }

  const snapshot = await query.orderBy("createdAt", "desc").get();
  return snapshot.docs.map((doc) => doc.data() as Invoice);
}
