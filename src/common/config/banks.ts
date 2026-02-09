export const BANKS: Record<string, string> = {
  "9999": "デモ銀行",
};

export function getBankName(bankCode: string): string {
  return BANKS[bankCode] ?? bankCode;
}

export const BRANCHES: Record<string, string> = {
  "001": "法人支店",
  "002": "個人支店",
};

export function getBranchName(branchCode: string): string {
  return BRANCHES[branchCode] ?? branchCode;
}
