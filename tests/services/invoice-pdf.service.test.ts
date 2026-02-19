import { jest } from "@jest/globals";
import { parseInvoicePdf } from "@token/services/invoice-pdf.service.js";

const mockGetText = jest.fn<() => Promise<string>>();

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    load: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getText: mockGetText,
    destroy: jest.fn<() => void>(),
  })),
}));

describe("Invoice PDF Service", () => {
  it("should be able to import the service", () => {
    expect(parseInvoicePdf).toBeDefined();
  });

  it("should throw error for invalid PDF content", async () => {
    mockGetText.mockResolvedValue("some text without marker");
    const buffer = Buffer.from("invalid pdf");
    await expect(parseInvoicePdf(buffer)).rejects.toThrow("Not a NexBridge invoice PDF");
  });

  it("should parse valid invoice data from PDF", async () => {
    const data = {
      v: 1,
      tokenId: "JPYN",
      amount: 10000,
      recipientAddress: "rXXXXXXX",
      recipientName: "田中太郎",
      description: "テスト",
      dueDate: "2026-03-01",
    };
    const base64 = Buffer.from(JSON.stringify(data)).toString("base64");
    mockGetText.mockResolvedValue(`Some text NEXBRIDGE_INVOICE_DATA:${base64} more text`);
    const result = await parseInvoicePdf(Buffer.from("fake pdf"));
    expect(result).toEqual({
      tokenId: "JPYN",
      amount: 10000,
      recipientAddress: "rXXXXXXX",
      recipientName: "田中太郎",
      description: "テスト",
      dueDate: "2026-03-01",
    });
  });
});
