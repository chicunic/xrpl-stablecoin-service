export const mockAccountService = {
  createAccount: vi.fn(),
  login: vi.fn(),
  getAccountById: vi.fn(),
  verifyPin: vi.fn(),
  updateBalance: vi.fn(),
  lookupAccount: vi.fn(),
  updateAccount: vi.fn(),
  changePin: vi.fn(),
  setup: () => {
    mockAccountService.createAccount.mockResolvedValue({});
    mockAccountService.login.mockResolvedValue({});
    mockAccountService.getAccountById.mockResolvedValue(null);
    mockAccountService.verifyPin.mockResolvedValue(undefined);
    mockAccountService.updateBalance.mockResolvedValue(undefined);
    mockAccountService.lookupAccount.mockResolvedValue(null);
    mockAccountService.updateAccount.mockResolvedValue({});
    mockAccountService.changePin.mockResolvedValue(undefined);
  },
  reset: () => {
    mockAccountService.createAccount.mockReset();
    mockAccountService.login.mockReset();
    mockAccountService.getAccountById.mockReset();
    mockAccountService.verifyPin.mockReset();
    mockAccountService.updateBalance.mockReset();
    mockAccountService.lookupAccount.mockReset();
    mockAccountService.updateAccount.mockReset();
    mockAccountService.changePin.mockReset();
  },
};

export const mockTransactionService = {
  getTransactionsByAccount: vi.fn(),
  setup: () => {
    mockTransactionService.getTransactionsByAccount.mockResolvedValue([]);
  },
  reset: () => {
    mockTransactionService.getTransactionsByAccount.mockReset();
  },
};

export const mockTransferService = {
  deposit: vi.fn(),
  withdraw: vi.fn(),
  transfer: vi.fn(),
  setup: () => {
    mockTransferService.deposit.mockResolvedValue({ balance: 0 });
    mockTransferService.withdraw.mockResolvedValue({ balance: 0 });
    mockTransferService.transfer.mockResolvedValue({ balance: 0, transactionId: "mock-tx-id" });
  },
  reset: () => {
    mockTransferService.deposit.mockReset();
    mockTransferService.withdraw.mockReset();
    mockTransferService.transfer.mockReset();
  },
};

export const mockVirtualAccountService = {
  createVirtualAccount: vi.fn(),
  listVirtualAccounts: vi.fn(),
  getVirtualAccountById: vi.fn(),
  updateVirtualAccount: vi.fn(),
  setup: () => {
    mockVirtualAccountService.createVirtualAccount.mockResolvedValue({});
    mockVirtualAccountService.listVirtualAccounts.mockResolvedValue([]);
    mockVirtualAccountService.getVirtualAccountById.mockResolvedValue(null);
    mockVirtualAccountService.updateVirtualAccount.mockResolvedValue({});
  },
  reset: () => {
    mockVirtualAccountService.createVirtualAccount.mockReset();
    mockVirtualAccountService.listVirtualAccounts.mockReset();
    mockVirtualAccountService.getVirtualAccountById.mockReset();
    mockVirtualAccountService.updateVirtualAccount.mockReset();
  },
};
