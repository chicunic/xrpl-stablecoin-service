import { getAllTokenConfigs, toXrplCurrency } from "@token/config/tokens.js";
import { getUserByVirtualAccountNumber, getUserByWalletAddress } from "@token/services/auth.service.js";
import { creditFiat } from "@token/services/fiat.service.js";
import { recordXrpTransaction } from "@token/services/token-balance.service.js";

export async function processBankDeposit(
  bankTransactionId: string,
  amount: number,
  virtualAccountNumber: string,
): Promise<void> {
  const user = await getUserByVirtualAccountNumber(virtualAccountNumber);
  if (!user) {
    console.warn(`No user found for virtual account: ${virtualAccountNumber}, txId: ${bankTransactionId}`);
    return;
  }

  await creditFiat(
    user.uid,
    amount,
    "deposit",
    `Bank deposit via virtual account ${virtualAccountNumber}`,
    bankTransactionId,
  );

  console.log(`Fiat deposit credited: userId=${user.uid}, amount=${amount}, txId=${bankTransactionId}`);
}

interface TokenTransactionData {
  transactionType: string;
  tx_json: {
    Account: string;
    Destination: string;
    Amount: { currency: string; value: string; issuer: string } | string;
  };
  meta: {
    TransactionResult: string;
    delivered_amount?: { currency: string; value: string; issuer: string } | string;
  };
}

export async function processXrplTokenTransaction(
  txHash: string,
  data: TokenTransactionData,
): Promise<{ processed: boolean; reason?: string }> {
  if (data.meta.TransactionResult !== "tesSUCCESS") {
    return { processed: false, reason: "transaction not successful" };
  }

  // Only process mint (issuer -> user) and transfer (user -> user)
  // burn (user -> issuer) doesn't credit anyone
  if (data.transactionType === "burn") {
    return { processed: false, reason: "burn transaction" };
  }

  const destination = data.tx_json.Destination;
  const deliveredAmount = data.meta.delivered_amount;

  if (!deliveredAmount || typeof deliveredAmount === "string") {
    return { processed: false, reason: "no token amount (XRP native)" };
  }

  // Find the token config matching this currency + issuer
  const tokenConfigs = getAllTokenConfigs();
  const tokenConfig = tokenConfigs.find(
    (t) =>
      (t.currency === deliveredAmount.currency || toXrplCurrency(t.currency) === deliveredAmount.currency) &&
      t.issuerAddress === deliveredAmount.issuer,
  );
  if (!tokenConfig) {
    return { processed: false, reason: "unknown token" };
  }

  // Find the user who owns the destination wallet
  const user = await getUserByWalletAddress(destination);
  if (!user) {
    return { processed: false, reason: "destination is not a custodial wallet" };
  }

  const amount = Number(deliveredAmount.value);
  if (Number.isNaN(amount) || amount <= 0) {
    return { processed: false, reason: "invalid amount" };
  }

  await recordXrpTransaction(
    user.uid,
    tokenConfig.tokenId,
    "deposit",
    amount,
    `Token deposit via XRPL tx ${txHash}`,
    txHash,
  );

  console.log(
    `XRPL token deposit credited: userId=${user.uid}, token=${tokenConfig.tokenId}, amount=${amount}, txHash=${txHash}`,
  );

  return { processed: true };
}
