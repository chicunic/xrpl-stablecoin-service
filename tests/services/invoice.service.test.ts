import { Timestamp } from "firebase-admin/firestore";
import { mockFirestoreService } from "../utils/mock.firestore";

const { mockGetFirestore } = vi.hoisted(() => ({
  mockGetFirestore: vi.fn(),
}));

vi.mock("@common/config/firebase.js", () => ({
  initializeFirebase: vi.fn(),
  getFirestore: mockGetFirestore,
}));

import { listInvoices } from "../../src/token/services/invoice.service";

describe("invoice.service", () => {
  beforeEach(() => {
    mockFirestoreService.reset();
    mockFirestoreService.setup();
    mockGetFirestore.mockReturnValue({
      collection: mockFirestoreService.collection,
      collectionGroup: mockFirestoreService.collectionGroup,
      runTransaction: mockFirestoreService.runTransaction,
    });
  });

  describe("listInvoices", () => {
    it("should list and filter invoices by type via Firestore query", async () => {
      const userId = "user-123";

      // Mock returns only issued invoices (Firestore handles filtering)
      const mockIssuedInvoices = [
        {
          invoiceId: "inv-3",
          userId,
          type: "issued",
          createdAt: Timestamp.fromMillis(2000),
          status: "draft",
        },
        {
          invoiceId: "inv-1",
          userId,
          type: "issued",
          createdAt: Timestamp.fromMillis(1000),
          status: "draft",
        },
      ];

      mockFirestoreService.get.mockResolvedValue({
        docs: mockIssuedInvoices.map((data) => ({
          data: () => data,
        })),
      });

      const issuedInvoices = await listInvoices(userId, "issued");

      expect(issuedInvoices).toHaveLength(2);
      expect(issuedInvoices[0]!.invoiceId).toBe("inv-3");
      expect(issuedInvoices[1]!.invoiceId).toBe("inv-1");

      expect(mockFirestoreService.where).toHaveBeenCalledWith("userId", "==", userId);
      expect(mockFirestoreService.where).toHaveBeenCalledWith("type", "==", "issued");
      expect(mockFirestoreService.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    });

    it("should return all types if type is not specified", async () => {
      const userId = "user-123";
      const mockInvoices = [
        {
          invoiceId: "inv-2",
          userId,
          type: "received",
          createdAt: Timestamp.fromMillis(3000),
        },
        {
          invoiceId: "inv-1",
          userId,
          type: "issued",
          createdAt: Timestamp.fromMillis(1000),
        },
      ];

      mockFirestoreService.get.mockResolvedValue({
        docs: mockInvoices.map((data) => ({
          data: () => data,
        })),
      });

      const allInvoices = await listInvoices(userId);

      expect(allInvoices).toHaveLength(2);
      expect(allInvoices[0]!.invoiceId).toBe("inv-2");
      expect(allInvoices[1]!.invoiceId).toBe("inv-1");
    });
  });
});
