import { createJestMock, createSimpleModuleMock } from "../utils/mock.factory";

const mockGetClient = createJestMock();
const mockSignWithKms = createJestMock();
const mockGetWalletForSigning = createJestMock();
const mockEncodeForSigning = createJestMock();

createSimpleModuleMock("../../src/token/services/xrpl.service", {
  getClient: mockGetClient,
});

createSimpleModuleMock("../../src/token/services/signing.service", {
  signWithKms: mockSignWithKms,
});

createSimpleModuleMock("../../src/token/services/wallet.service", {
  getWalletForSigning: mockGetWalletForSigning,
});

jest.mock("xrpl", () => ({
  ...jest.requireActual("xrpl"),
  encodeForSigning: (...args: any[]) => mockEncodeForSigning(...args),
}));

import {
  acceptCredential,
  CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  getCredentialStatus,
  issueCredential,
  revokeCredential,
} from "../../src/token/services/credential.service";

describe("credential.service", () => {
  const mockClient = {
    autofill: createJestMock(),
    submit: createJestMock(),
    request: createJestMock(),
  };

  const mockWallet = {
    sign: createJestMock(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue(mockClient);
    mockSignWithKms.mockResolvedValue("mock-signature");
    mockGetWalletForSigning.mockResolvedValue(mockWallet);
    mockEncodeForSigning.mockReturnValue("AABBCCDD");
    mockClient.autofill.mockImplementation(async (tx: any) => ({ ...tx, Sequence: 1, Fee: "12" }));
  });

  describe("issueCredential", () => {
    it("should create and submit a CredentialCreate transaction", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tesSUCCESS", tx_json: { hash: "issue-tx-hash" } },
      });

      const txHash = await issueCredential("rUserAddress123", CREDENTIAL_TYPE_KYC_JAPAN_HEX);

      expect(txHash).toBe("issue-tx-hash");
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "CredentialCreate",
          Subject: "rUserAddress123",
          CredentialType: CREDENTIAL_TYPE_KYC_JAPAN_HEX,
        }),
      );
      expect(mockSignWithKms).toHaveBeenCalled();
    });

    it("should throw on transaction failure", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tecNO_ENTRY", engine_result_message: "No such entry" },
      });

      await expect(issueCredential("rUserAddress123", CREDENTIAL_TYPE_KYC_JAPAN_HEX)).rejects.toThrow(
        "XRPL transaction failed",
      );
    });
  });

  describe("acceptCredential", () => {
    it("should create and submit a CredentialAccept transaction", async () => {
      mockWallet.sign.mockReturnValue({ tx_blob: "mock-blob", hash: "mock-hash" });
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tesSUCCESS", tx_json: { hash: "accept-tx-hash" } },
      });

      const txHash = await acceptCredential(1, "rUserAddress123", "rIssuerAddress", CREDENTIAL_TYPE_KYC_JAPAN_HEX);

      expect(txHash).toBe("accept-tx-hash");
      expect(mockGetWalletForSigning).toHaveBeenCalledWith(1);
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "CredentialAccept",
          Account: "rUserAddress123",
          Issuer: "rIssuerAddress",
        }),
      );
    });
  });

  describe("revokeCredential", () => {
    it("should create and submit a CredentialDelete transaction", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tesSUCCESS", tx_json: { hash: "revoke-tx-hash" } },
      });

      const txHash = await revokeCredential("rUserAddress123", CREDENTIAL_TYPE_KYC_JAPAN_HEX);

      expect(txHash).toBe("revoke-tx-hash");
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "CredentialDelete",
          Subject: "rUserAddress123",
        }),
      );
    });
  });

  describe("getCredentialStatus", () => {
    it("should return exists and accepted when credential is found and accepted", async () => {
      mockClient.request.mockResolvedValue({
        result: {
          node: {
            Flags: 0x00010000, // lsfAccepted
            Expiration: 1700000000,
          },
        },
      });

      const status = await getCredentialStatus("rUser", "rIssuer", CREDENTIAL_TYPE_KYC_JAPAN_HEX);

      expect(status).toEqual({ exists: true, accepted: true, expiration: 1700000000 });
    });

    it("should return not accepted when flag is not set", async () => {
      mockClient.request.mockResolvedValue({
        result: {
          node: { Flags: 0 },
        },
      });

      const status = await getCredentialStatus("rUser", "rIssuer", CREDENTIAL_TYPE_KYC_JAPAN_HEX);

      expect(status).toEqual({ exists: true, accepted: false, expiration: undefined });
    });

    it("should return not exists when entry not found", async () => {
      mockClient.request.mockRejectedValue({ data: { error: "entryNotFound" } });

      const status = await getCredentialStatus("rUser", "rIssuer", CREDENTIAL_TYPE_KYC_JAPAN_HEX);

      expect(status).toEqual({ exists: false, accepted: false });
    });

    it("should rethrow unexpected errors", async () => {
      mockClient.request.mockRejectedValue(new Error("Network error"));

      await expect(getCredentialStatus("rUser", "rIssuer", CREDENTIAL_TYPE_KYC_JAPAN_HEX)).rejects.toThrow(
        "Network error",
      );
    });
  });
});
