import { ValidationError } from "@common/utils/error.handler.js";
import jsQR from "jsqr";
import { PNG } from "pngjs";

export interface ParsedInvoiceData {
  tokenId: string;
  amount: number;
  recipientAddress: string;
  recipientName: string;
  description: string;
  dueDate?: string;
  invoiceId?: string;
}

export async function parseInvoicePdf(buffer: Buffer): Promise<ParsedInvoiceData> {
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(buffer, { scale: 2 });

  let qrData: string | null = null;

  for await (const pageBuffer of doc) {
    const png = PNG.sync.read(pageBuffer);
    const imageData = new Uint8ClampedArray(png.data);
    const result = jsQR(imageData, png.width, png.height);
    if (result) {
      qrData = result.data;
      break;
    }
  }

  if (!qrData) {
    throw new ValidationError("Not a NexBridge invoice PDF");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(qrData);
  } catch {
    throw new ValidationError("Failed to decode QR code data from PDF");
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
    ...(data.invoiceId ? { invoiceId: String(data.invoiceId) } : {}),
  };
}
