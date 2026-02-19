import { createJestMock, createSimpleModuleMock } from "../utils/mock.factory";

const mockGetClient = createJestMock();
const mockSignWithKms = createJestMock();
const mockEncodeForSigning = createJestMock();

createSimpleModuleMock("../../src/token/services/xrpl.service", {
  getClient: mockGetClient,
});

createSimpleModuleMock("../../src/token/services/signing.service", {
  signWithKms: mockSignWithKms,
});

jest.mock("xrpl", () => ({
  ...jest.requireActual("xrpl"),
  encodeForSigning: (...args: any[]) => mockEncodeForSigning(...args),
}));

import { createDomain, deleteDomain, getDomainInfo, updateDomain } from "../../src/token/services/domain.service";

describe("domain.service", () => {
  const mockClient = {
    autofill: createJestMock(),
    submit: createJestMock(),
    request: createJestMock(),
  };

  const testCredentials = [{ issuer: "rIssuer123", credentialType: "4B59435F4A4150414E" }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue(mockClient);
    mockSignWithKms.mockResolvedValue("mock-signature");
    mockEncodeForSigning.mockReturnValue("AABBCCDD");
    mockClient.autofill.mockImplementation(async (tx: any) => ({ ...tx, Sequence: 42, Fee: "12" }));
  });

  describe("createDomain", () => {
    it("should submit PermissionedDomainSet without DomainID", async () => {
      mockClient.submit.mockResolvedValue({
        result: {
          engine_result: "tesSUCCESS",
          tx_json: { hash: "create-domain-hash", Sequence: 42 },
          meta: {
            AffectedNodes: [
              {
                CreatedNode: {
                  LedgerEntryType: "PermissionedDomain",
                  LedgerIndex: "ABCDEF1234567890",
                },
              },
            ],
          },
        },
      });

      const result = await createDomain(testCredentials);

      expect(result.txHash).toBe("create-domain-hash");
      expect(result.domainId).toBe("ABCDEF1234567890");
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "PermissionedDomainSet",
          AcceptedCredentials: [{ Credential: { Issuer: "rIssuer123", CredentialType: "4B59435F4A4150414E" } }],
        }),
      );
    });

    it("should throw on transaction failure", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tecNO_PERMISSION", engine_result_message: "No permission" },
      });

      await expect(createDomain(testCredentials)).rejects.toThrow("XRPL transaction failed");
    });
  });

  describe("updateDomain", () => {
    it("should submit PermissionedDomainSet with DomainID", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tesSUCCESS", tx_json: { hash: "update-domain-hash" } },
      });

      const txHash = await updateDomain("DOMAIN123", testCredentials);

      expect(txHash).toBe("update-domain-hash");
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "PermissionedDomainSet",
          DomainID: "DOMAIN123",
        }),
      );
    });
  });

  describe("deleteDomain", () => {
    it("should submit PermissionedDomainDelete", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tesSUCCESS", tx_json: { hash: "delete-domain-hash" } },
      });

      const txHash = await deleteDomain("DOMAIN123");

      expect(txHash).toBe("delete-domain-hash");
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "PermissionedDomainDelete",
          DomainID: "DOMAIN123",
        }),
      );
    });
  });

  describe("getDomainInfo", () => {
    it("should return domain info when found", async () => {
      const mockNode = {
        LedgerEntryType: "PermissionedDomain",
        Owner: "rIssuer123",
        AcceptedCredentials: [],
      };
      mockClient.request.mockResolvedValue({ result: { node: mockNode } });

      const info = await getDomainInfo("DOMAIN123");

      expect(info).toEqual(mockNode);
    });

    it("should return null when not found", async () => {
      mockClient.request.mockRejectedValue({ data: { error: "entryNotFound" } });

      const info = await getDomainInfo("NONEXISTENT");

      expect(info).toBeNull();
    });
  });
});
