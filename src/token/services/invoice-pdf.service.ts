import { ValidationError } from "@common/utils/error.handler.js";
import { PDFParse } from "pdf-parse";

export interface ParsedInvoiceData {
  tokenId: string;
  amount: number;
  recipientAddress: string;
  recipientName: string;
  description: string;
  dueDate?: string;
}

const DATA_MARKER = "NEXBRIDGE_INVOICE_DATA:";

export async function parseInvoicePdf(buffer: Buffer): Promise<ParsedInvoiceData> {
  const parser = new PDFParse({});
  await parser.load(buffer);
  const text = await parser.getText();

  const markerIndex = text.indexOf(DATA_MARKER);
  if (markerIndex === -1) {
    throw new ValidationError("Not a NexBridge invoice PDF");
  }

  const base64Start = markerIndex + DATA_MARKER.length;
  // Extract until whitespace or end of text
  const match = text.slice(base64Start).match(/^([A-Za-z0-9+/=]+)/);
  if (!match) {
    throw new ValidationError("Failed to extract invoice data from PDF");
  }

  let parsed: unknown;
  try {
    const json = Buffer.from(match[1] as string, "base64").toString("utf-8");
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError("Failed to decode invoice data from PDF");
  }

  const data = parsed as Record<string, unknown>;

  if (!data.tokenId || !data.amount || !data.recipientAddress || !data.recipientName || !data.description) {
    throw new ValidationError("Incomplete invoice data in PDF");
  }

  return {
    tokenId: String(data.tokenId),
    amount: Number(data.amount),
    recipientAddress: String(data.recipientAddress),
    recipientName: String(data.recipientName),
    description: String(data.description),
    ...(data.dueDate ? { dueDate: String(data.dueDate) } : {}),
  };
}
