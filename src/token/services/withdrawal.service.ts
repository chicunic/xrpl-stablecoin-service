import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { getBankAuthToken, getBankServiceUrl } from "@token/config/bank.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { debitFiat } from "@token/services/fiat.service.js";
import { recordXrpTransaction } from "@token/services/token-balance.service.js";
import {
  getBankWhitelist,
  getXrpWhitelist,
  isBankWhitelisted,
  isXrpWhitelisted,
} from "@token/services/whitelist.service.js";
import { sendTokenFromUser } from "@token/services/xrpl.service.js";
import type { BankAccount } from "@token/types/user.type.js";

interface FiatWithdrawalResult {
  amount: number;
  destination: { bankCode: string; branchCode: string; accountNumber: string; accountHolder: string };
  txReference: string;
}

interface XrpWithdrawalResult {
  tokenId: string;
  amount: number;
  destinationAddress: string;
  xrplTxHash: string;
}

export async function withdrawFiat(
  userId: string,
  amount: number,
  bankAccount: BankAccount,
): Promise<FiatWithdrawalResult> {
  const whitelist = await getBankWhitelist(userId);
  if (!isBankWhitelisted(whitelist, bankAccount.branchCode, bankAccount.accountNumber)) {
    throw new ValidationError("Invalid: destination bank account is not in whitelist");
  }

  await debitFiat(userId, amount, "withdrawal", `Fiat withdrawal to ${bankAccount.accountHolder}`);
  const txReference = await initiateBankTransfer(bankAccount, amount);

  return {
    amount,
    destination: {
      bankCode: bankAccount.bankCode,
      branchCode: bankAccount.branchCode,
      accountNumber: bankAccount.accountNumber,
      accountHolder: bankAccount.accountHolder,
    },
    txReference,
  };
}

export async function withdrawXrp(
  userId: string,
  tokenId: string,
  tokenAmount: number,
  destinationAddress: string,
): Promise<XrpWithdrawalResult> {
  const wallet = await getUserWallet(userId);
  if (!wallet) {
    throw new NotFoundError("Wallet not set up");
  }

  const whitelist = await getXrpWhitelist(userId);
  if (!isXrpWhitelisted(whitelist, destinationAddress)) {
    throw new ValidationError("Invalid: destination address is not in whitelist");
  }

  const tokenConfig = getTokenConfig(tokenId);

  const txHash = await sendTokenFromUser(
    wallet.bipIndex,
    wallet.address,
    destinationAddress,
    tokenConfig.currency,
    tokenAmount.toString(),
    tokenConfig.issuerAddress,
  );

  await recordXrpTransaction(userId, tokenId, "withdrawal", tokenAmount, `Withdrawal to ${destinationAddress}`);

  return { tokenId, amount: tokenAmount, destinationAddress, xrplTxHash: txHash };
}

async function initiateBankTransfer(bankAccount: BankAccount, amount: number): Promise<string> {
  const bankServiceUrl = getBankServiceUrl();
  const bankAuthToken = await getBankAuthToken();
  const url = `${bankServiceUrl}/api/v1/transfers`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bankAuthToken}`,
    },
    body: JSON.stringify({
      toBranchCode: bankAccount.branchCode,
      toAccountNumber: bankAccount.accountNumber,
      amount,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bank transfer failed: ${response.status}`);
  }

  const data = (await response.json()) as { transactionId: string };
  return data.transactionId;
}
