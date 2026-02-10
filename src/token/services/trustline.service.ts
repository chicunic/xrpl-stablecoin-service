import { toXrplCurrency } from "@token/config/tokens.js";
import { getWalletForSigning } from "@token/services/wallet.service.js";
import { getClient } from "@token/services/xrpl.service.js";
import type { AccountLinesResponse, TrustSet } from "xrpl";

const DEFAULT_LIMIT = "1000000000";

export async function hasTrustLine(userAddress: string, currency: string, issuerAddress: string): Promise<boolean> {
  const client = await getClient();

  const response: AccountLinesResponse = await client.request({
    command: "account_lines",
    account: userAddress,
    peer: issuerAddress,
  });

  const xrplCurrency = toXrplCurrency(currency);
  return response.result.lines.some((line) => line.currency === xrplCurrency);
}

export async function setTrustLine(
  xrpAddressIndex: number,
  userAddress: string,
  currency: string,
  issuerAddress: string,
  limit: string = DEFAULT_LIMIT,
): Promise<string> {
  const client = await getClient();
  const wallet = await getWalletForSigning(xrpAddressIndex);

  const trustSet: TrustSet = {
    TransactionType: "TrustSet",
    Account: userAddress,
    LimitAmount: {
      currency: toXrplCurrency(currency),
      issuer: issuerAddress,
      value: limit,
    },
  };

  const prepared = await client.autofill(trustSet);
  const signed = wallet.sign(prepared);
  const result = await client.submit(signed.tx_blob);

  if (result.result.engine_result !== "tesSUCCESS") {
    throw new Error(`TrustSet failed: ${result.result.engine_result_message}`);
  }

  return result.result.tx_json?.hash ?? "";
}

export async function ensureTrustLine(
  xrpAddressIndex: number,
  userAddress: string,
  currency: string,
  issuerAddress: string,
): Promise<void> {
  const exists = await hasTrustLine(userAddress, currency, issuerAddress);
  if (!exists) {
    await setTrustLine(xrpAddressIndex, userAddress, currency, issuerAddress);
  }
}
