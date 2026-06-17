export const mockXrplService = {
  mint: vi.fn(),
  transfer: vi.fn(),
  burn: vi.fn(),
  authorize: vi.fn(),
  issuerAuthorize: vi.fn(),
  hasMptAuthorization: vi.fn(),
  getMptBalance: vi.fn(),
  getMptBalances: vi.fn(),
  sendXrpFromUser: vi.fn(),
  getClient: vi.fn(),
  disconnect: vi.fn(),
  setup: () => {
    mockXrplService.mint.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.transfer.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.burn.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.authorize.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.issuerAuthorize.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.hasMptAuthorization.mockResolvedValue(false);
    mockXrplService.getMptBalance.mockResolvedValue("0");
    mockXrplService.getMptBalances.mockResolvedValue([]);
    mockXrplService.sendXrpFromUser.mockResolvedValue("mock-tx-hash-123");
    mockXrplService.getClient.mockResolvedValue({});
    mockXrplService.disconnect.mockResolvedValue(undefined);
  },
  reset: () => {
    mockXrplService.mint.mockReset();
    mockXrplService.transfer.mockReset();
    mockXrplService.burn.mockReset();
    mockXrplService.authorize.mockReset();
    mockXrplService.issuerAuthorize.mockReset();
    mockXrplService.hasMptAuthorization.mockReset();
    mockXrplService.getMptBalance.mockReset();
    mockXrplService.getMptBalances.mockReset();
    mockXrplService.sendXrpFromUser.mockReset();
    mockXrplService.getClient.mockReset();
    mockXrplService.disconnect.mockReset();
  },
};

export const mockKmsService = {
  signWithKms: vi.fn(),
  getPublicKey: vi.fn(),
  setup: () => {
    mockKmsService.signWithKms.mockResolvedValue("mock-signature");
    mockKmsService.getPublicKey.mockResolvedValue("mock-public-key");
  },
  reset: () => {
    mockKmsService.signWithKms.mockReset();
    mockKmsService.getPublicKey.mockReset();
  },
};

export const mockWalletService = {
  deriveWallet: vi.fn(),
  getWalletForSigning: vi.fn(),
  setup: () => {
    mockWalletService.deriveWallet.mockReturnValue({ address: "rMockAddress123", publicKey: "mock-pub-key" });
    mockWalletService.getWalletForSigning.mockReturnValue({
      sign: vi.fn().mockReturnValue({ tx_blob: "mock-blob", hash: "mock-hash" }),
    });
  },
  reset: () => {
    mockWalletService.deriveWallet.mockReset();
    mockWalletService.getWalletForSigning.mockReset();
  },
};

export const mockFaucetService = {
  fundAccount: vi.fn(),
  setup: () => {
    mockFaucetService.fundAccount.mockResolvedValue({ balance: 1000 });
  },
  reset: () => {
    mockFaucetService.fundAccount.mockReset();
  },
};
