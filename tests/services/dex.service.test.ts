import { createJestMock, createSimpleModuleMock } from "../utils/mock.factory";

const mockGetClient = createJestMock();
const mockGetWalletForSigning = createJestMock();

createSimpleModuleMock("../../src/token/services/xrpl.service", {
  getClient: mockGetClient,
});

createSimpleModuleMock("../../src/token/services/wallet.service", {
  getWalletForSigning: mockGetWalletForSigning,
});

import {
  buildOfferAmounts,
  cancelOffer,
  createPermissionedOffer,
  getPermissionedOrderBook,
  tfHybrid,
} from "../../src/token/services/dex.service";

describe("dex.service", () => {
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
    mockGetWalletForSigning.mockResolvedValue(mockWallet);
    mockClient.autofill.mockImplementation(async (tx: any) => ({ ...tx, Sequence: 100, Fee: "12" }));
    mockWallet.sign.mockReturnValue({ tx_blob: "mock-blob", hash: "mock-hash" });
  });

  describe("createPermissionedOffer", () => {
    it("should create an OfferCreate with DomainID", async () => {
      mockClient.submit.mockResolvedValue({
        result: {
          engine_result: "tesSUCCESS",
          tx_json: { hash: "offer-tx-hash", Sequence: 100 },
        },
      });

      const result = await createPermissionedOffer(
        1,
        "rUserAddress",
        { currency: "JPYN", value: "1000", issuer: "rIssuer" },
        "1000000",
        "DOMAIN123",
      );

      expect(result.txHash).toBe("offer-tx-hash");
      expect(result.offerSequence).toBe(100);
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "OfferCreate",
          DomainID: "DOMAIN123",
        }),
      );
    });

    it("should include tfHybrid flag when specified", async () => {
      mockClient.submit.mockResolvedValue({
        result: {
          engine_result: "tesSUCCESS",
          tx_json: { hash: "hybrid-tx-hash", Sequence: 101 },
        },
      });

      await createPermissionedOffer(
        1,
        "rUserAddress",
        "1000000",
        { currency: "JPYN", value: "1000", issuer: "rIssuer" },
        "DOMAIN123",
        tfHybrid,
      );

      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          Flags: tfHybrid,
        }),
      );
    });

    it("should throw on transaction failure", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tecUNFUNDED_OFFER", engine_result_message: "Unfunded offer" },
      });

      await expect(
        createPermissionedOffer(1, "rUser", "1000000", { currency: "JPYN", value: "100", issuer: "rI" }, "D"),
      ).rejects.toThrow("XRPL transaction failed");
    });
  });

  describe("cancelOffer", () => {
    it("should submit OfferCancel transaction", async () => {
      mockClient.submit.mockResolvedValue({
        result: { engine_result: "tesSUCCESS", tx_json: { hash: "cancel-tx-hash" } },
      });

      const txHash = await cancelOffer(1, "rUserAddress", 100);

      expect(txHash).toBe("cancel-tx-hash");
      expect(mockClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({
          TransactionType: "OfferCancel",
          OfferSequence: 100,
        }),
      );
    });
  });

  describe("getPermissionedOrderBook", () => {
    it("should fetch and filter order book by domainId", async () => {
      mockClient.request
        .mockResolvedValueOnce({
          result: {
            offers: [
              { DomainID: "DOMAIN123", TakerGets: "1000" },
              { DomainID: "OTHER", TakerGets: "2000" },
            ],
          },
        })
        .mockResolvedValueOnce({
          result: {
            offers: [{ DomainID: "DOMAIN123", TakerPays: "500" }],
          },
        });

      const orderBook = await getPermissionedOrderBook(
        "DOMAIN123",
        { currency: "JPYN", issuer: "rIssuer" },
        { currency: "XRP" },
      );

      expect(orderBook.asks).toHaveLength(1);
      expect(orderBook.asks[0].DomainID).toBe("DOMAIN123");
      expect(orderBook.bids).toHaveLength(1);
    });
  });

  describe("buildOfferAmounts", () => {
    it("should build buy side amounts (pay XRP, get token)", () => {
      const { takerGets, takerPays } = buildOfferAmounts("JPYN", "buy", "100", "0.01");

      // takerGets = XRP drops (buy: we get XRP? No - buy means we buy token)
      // buy: takerGets = XRP amount, takerPays = token amount
      expect(takerGets).toBe("1000000"); // 100 * 0.01 * 1_000_000
      expect(takerPays).toEqual(
        expect.objectContaining({
          value: "100",
        }),
      );
    });

    it("should build sell side amounts (pay token, get XRP)", () => {
      const { takerGets, takerPays } = buildOfferAmounts("JPYN", "sell", "100", "0.01");

      expect(takerGets).toEqual(
        expect.objectContaining({
          value: "100",
        }),
      );
      expect(takerPays).toBe("1000000");
    });
  });
});
