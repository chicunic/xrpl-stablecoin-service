import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { getBankAuthToken, getBankServiceUrl } from "@token/config/bank.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { creditFiat, debitFiat } from "@token/services/fiat.service.js";
import { recordMptTransaction } from "@token/services/token-balance.service.js";
import {
  getBankWhitelist,
  getXrplWhitelist,
  isBankWhitelisted,
  isXrplWhitelisted,
} from "@token/services/whitelist.service.js";
import { transfer } from "@token/services/xrpl.service.js";
import type { BankAccount } from "@token/types/user.type.js";

interface FiatWithdrawalResult {
  amount: number;
  destination: { bankCode: string; branchCode: string; accountNumber: string; accountHolder: string };
  txReference: string;
}

interface MptWithdrawalResult {
  tokenId: string;
  amount: number;
  destinationAddress: string;
  xrplTxHash: string;
}

export async function withdrawFiat(
  userId: string,
  amount: number,
  bankAccount: Omit<BankAccount, "createdAt">,
): Promise<FiatWithdrawalResult> {
  const whitelist = await getBankWhitelist(userId);
  if (!isBankWhitelisted(whitelist, bankAccount.branchCode, bankAccount.accountNumber)) {
    throw new ValidationError("Invalid: destination bank account is not in whitelist");
  }

  const idempotencyKey = randomUUID();
  await debitFiat(userId, amount, "withdrawal", "JPY 出金");

  let txReference: string;
  try {
    txReference = await initiateBankTransfer(bankAccount, amount, idempotencyKey);
  } catch (error) {
    // Bank transfer failed: refund the deducted balance
    console.error(`Bank transfer failed for user ${userId}, refunding ${String(amount)}:`, error);
    await creditFiat(userId, amount, "refund", "JPY 出金 返金");
    throw error;
  }

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

export async function withdrawMpt(
  userId: string,
  tokenId: string,
  tokenAmount: number,
  destinationAddress: string,
): Promise<MptWithdrawalResult> {
  const wallet = await getUserWallet(userId);
  if (!wallet) {
    throw new NotFoundError("Wallet not set up");
  }

  const whitelist = await getXrplWhitelist(userId);
  if (!isXrplWhitelisted(whitelist, destinationAddress)) {
    throw new ValidationError("Invalid: destination address is not in whitelist");
  }

  const tokenConfig = getTokenConfig(tokenId);

  const txHash = await transfer(
    wallet.bipIndex,
    wallet.address,
    destinationAddress,
    tokenConfig.mptIssuanceId,
    tokenAmount.toString(),
  );

  // XRPL tx is irreversible once submitted, so the record must not be lost even if the Firestore write fails.
  try {
    await recordMptTransaction(userId, tokenId, "withdrawal", tokenAmount, `${tokenConfig.name} 出金`, txHash, txHash);
  } catch (recordError) {
    console.error(
      `CRITICAL: XRPL withdrawal succeeded (txHash=${txHash}) but record failed for user ${userId}:`,
      recordError,
    );
    // Retry once
    try {
      await recordMptTransaction(userId, tokenId, "withdrawal", tokenAmount, `${tokenConfig.name} 出金`, txHash);
    } catch (retryError) {
      console.error(
        `CRITICAL: Retry also failed for txHash=${txHash}, user=${userId}. Manual reconciliation required.`,
        retryError,
      );
    }
  }

  return { tokenId, amount: tokenAmount, destinationAddress, xrplTxHash: txHash };
}

async function initiateBankTransfer(
  bankAccount: Omit<BankAccount, "createdAt">,
  amount: number,
  idempotencyKey: string,
): Promise<string> {
  const bankServiceUrl = getBankServiceUrl();
  const bankAuthToken = getBankAuthToken();
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
      idempotencyKey,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bank transfer failed: ${String(response.status)}`);
  }

  const data = (await response.json()) as { transactionId: string };
  return data.transactionId;
}
