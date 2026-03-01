const mockJsQR = vi.fn();

vi.mock("pdf-to-img", () => ({
  pdf: vi.fn().mockImplementation(async function* () {
    // yield a minimal 1x1 PNG buffer
    yield Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
  }),
}));

vi.mock("jsqr", () => ({
  default: (...args: any[]) => mockJsQR(...args),
}));

import { parseInvoicePdf } from "@token/services/invoice-pdf.service.js";

describe("Invoice PDF Service", () => {
  it("should be able to import the service", () => {
    expect(parseInvoicePdf).toBeDefined();
  });

  it("should throw error when no QR code found", async () => {
    mockJsQR.mockReturnValue(null);
    const buffer = Buffer.from("fake pdf");
    await expect(parseInvoicePdf(buffer)).rejects.toThrow("Not a NexBridge invoice PDF");
  });

  it("should parse valid invoice data from QR code in PDF", async () => {
    const data = {
      v: 1,
      tokenId: "JPYN",
      amount: 10000,
      recipientAddress: "rXXXXXXX",
      recipientName: "田中太郎",
      description: "テスト",
      dueDate: "2026-03-01",
    };
    mockJsQR.mockReturnValue({ data: JSON.stringify(data) });
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
