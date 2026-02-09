import { createJestMock, createSimpleModuleMock } from "../../utils/mock.factory";

export const mockAccountService = {
  createAccount: createJestMock(),
  login: createJestMock(),
  getAccountById: createJestMock(),
  verifyPin: createJestMock(),
  updateBalance: createJestMock(),
  lookupAccount: createJestMock(),
  updateAccount: createJestMock(),
  changePin: createJestMock(),
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
  getTransactionsByAccount: createJestMock(),
  setup: () => {
    mockTransactionService.getTransactionsByAccount.mockResolvedValue([]);
  },
  reset: () => {
    mockTransactionService.getTransactionsByAccount.mockReset();
  },
};

export const mockTransferService = {
  deposit: createJestMock(),
  withdraw: createJestMock(),
  transfer: createJestMock(),
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

export function enableAccountServiceMock() {
  createSimpleModuleMock("../../src/bank/services/account.service", {
    createAccount: mockAccountService.createAccount,
    login: mockAccountService.login,
    getAccountById: mockAccountService.getAccountById,
    verifyPin: mockAccountService.verifyPin,
    updateBalance: mockAccountService.updateBalance,
    lookupAccount: mockAccountService.lookupAccount,
    updateAccount: mockAccountService.updateAccount,
    changePin: mockAccountService.changePin,
  });
}

export function enableTransactionServiceMock() {
  createSimpleModuleMock("../../src/bank/services/transaction.service", {
    getTransactionsByAccount: mockTransactionService.getTransactionsByAccount,
  });
}

export function enableTransferServiceMock() {
  createSimpleModuleMock("../../src/bank/services/transfer.service", {
    deposit: mockTransferService.deposit,
    withdraw: mockTransferService.withdraw,
    transfer: mockTransferService.transfer,
  });
}

export const mockVirtualAccountService = {
  createVirtualAccount: createJestMock(),
  listVirtualAccounts: createJestMock(),
  getVirtualAccountById: createJestMock(),
  updateVirtualAccount: createJestMock(),
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

export function enableVirtualAccountServiceMock() {
  createSimpleModuleMock("../../src/bank/services/virtual-account.service", {
    createVirtualAccount: mockVirtualAccountService.createVirtualAccount,
    listVirtualAccounts: mockVirtualAccountService.listVirtualAccounts,
    getVirtualAccountById: mockVirtualAccountService.getVirtualAccountById,
    updateVirtualAccount: mockVirtualAccountService.updateVirtualAccount,
  });
}
