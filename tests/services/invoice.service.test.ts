import { Timestamp } from "firebase-admin/firestore";
import { mockFirestoreService } from "../utils/mock.firestore";

// Initialize mock before importing the service
mockFirestoreService.setup();

import { listInvoices } from "../../src/token/services/invoice.service";

describe("invoice.service", () => {
  beforeEach(() => {
    mockFirestoreService.reset();
    mockFirestoreService.setup();
  });

  describe("listInvoices", () => {
    it("should list, filter and sort invoices in-memory", async () => {
      const userId = "user-123";

      const mockInvoices = [
        {
          invoiceId: "inv-1",
          userId,
          type: "issued",
          createdAt: Timestamp.fromMillis(1000),
          status: "draft",
        },
        {
          invoiceId: "inv-2",
          userId,
          type: "received",
          createdAt: Timestamp.fromMillis(3000),
          status: "draft",
        },
        {
          invoiceId: "inv-3",
          userId,
          type: "issued",
          createdAt: Timestamp.fromMillis(2000),
          status: "draft",
        },
      ];

      mockFirestoreService.get.mockResolvedValue({
        docs: mockInvoices.map((data) => ({
          data: () => data,
        })),
      });

      // Test filtering by "issued" and sorting
      const issuedInvoices = await listInvoices(userId, "issued");

      expect(issuedInvoices).toHaveLength(2);
      expect(issuedInvoices[0]!.invoiceId).toBe("inv-3"); // Latest issued (2000ms)
      expect(issuedInvoices[1]!.invoiceId).toBe("inv-1"); // Oldest issued (1000ms)

      expect(mockFirestoreService.where).toHaveBeenCalledWith("userId", "==", userId);
      // Ensure orderBy was NOT called on the query (it should be in-memory now)
      expect(mockFirestoreService.orderBy).not.toHaveBeenCalled();
    });

    it("should return all types if type is not specified", async () => {
      const userId = "user-123";
      const mockInvoices = [
        {
          invoiceId: "inv-1",
          userId,
          type: "issued",
          createdAt: Timestamp.fromMillis(1000),
        },
        {
          invoiceId: "inv-2",
          userId,
          type: "received",
          createdAt: Timestamp.fromMillis(3000),
        },
      ];

      mockFirestoreService.get.mockResolvedValue({
        docs: mockInvoices.map((data) => ({
          data: () => data,
        })),
      });

      const allInvoices = await listInvoices(userId);

      expect(allInvoices).toHaveLength(2);
      expect(allInvoices[0]!.invoiceId).toBe("inv-2"); // Latest (3000ms)
      expect(allInvoices[1]!.invoiceId).toBe("inv-1"); // Oldest (1000ms)
    });
  });
});
