import { fromXrplCurrency, toXrplCurrency } from "@token/config/tokens.js";
import { signWithKms } from "@token/services/signing.service.js";
import { getWalletForSigning } from "@token/services/wallet.service.js";
import type { AccountLinesResponse, Payment, SubmitResponse } from "xrpl";
import { Client, encodeForSigning } from "xrpl";

const network = process.env.XRPL_NETWORK ?? "testnet";
const XRPL_URL =
  network === "mainnet"
    ? "wss://xrplcluster.com"
    : network === "devnet"
      ? "wss://s.devnet.rippletest.net:51233"
      : "wss://s.altnet.rippletest.net:51233";

let client: Client | null = null;

export async function getClient(): Promise<Client> {
  if (!client || !client.isConnected()) {
    client = new Client(XRPL_URL);
    await client.connect();
  }
  return client;
}

function extractTxHash(result: SubmitResponse): string {
  if (result.result.engine_result !== "tesSUCCESS") {
    throw new Error(`XRPL transaction failed: ${result.result.engine_result_message}`);
  }
  return result.result.tx_json?.hash ?? "";
}

async function signAndSubmitWithWallet(xrpAddressIndex: number, payment: Payment): Promise<string> {
  const xrplClient = await getClient();
  const wallet = await getWalletForSigning(xrpAddressIndex);

  const prepared = await xrplClient.autofill(payment);
  const signed = wallet.sign(prepared);
  const result = await xrplClient.submit(signed.tx_blob);

  return extractTxHash(result);
}

export async function sendToken(
  destination: string,
  currency: string,
  amount: string,
  issuerAddress: string,
  kmsKeyPath: string,
  signingPublicKey: string,
): Promise<string> {
  const xrplClient = await getClient();

  const payment: Payment = {
    TransactionType: "Payment",
    Account: issuerAddress,
    Destination: destination,
    Amount: {
      currency: toXrplCurrency(currency),
      value: amount,
      issuer: issuerAddress,
    },
  };

  const prepared = await xrplClient.autofill(payment);
  prepared.SigningPubKey = signingPublicKey;
  const encodedTx = encodeForSigning(prepared);
  const signature = await signWithKms(Buffer.from(encodedTx, "hex"), kmsKeyPath);

  const result = await xrplClient.submit({
    ...prepared,
    TxnSignature: signature,
  });

  return extractTxHash(result);
}

export async function getBalances(
  address: string,
): Promise<Array<{ currency: string; value: string; issuer: string }>> {
  const xrplClient = await getClient();

  const response: AccountLinesResponse = await xrplClient.request({
    command: "account_lines",
    account: address,
  });

  return response.result.lines.map((line) => ({
    currency: fromXrplCurrency(line.currency),
    value: line.balance,
    issuer: line.account,
  }));
}

export async function sendTokenFromUser(
  xrpAddressIndex: number,
  fromAddress: string,
  destination: string,
  currency: string,
  amount: string,
  issuerAddress: string,
): Promise<string> {
  return signAndSubmitWithWallet(xrpAddressIndex, {
    TransactionType: "Payment",
    Account: fromAddress,
    Destination: destination,
    Amount: {
      currency: toXrplCurrency(currency),
      value: amount,
      issuer: issuerAddress,
    },
  });
}

export async function sendXrpFromUser(
  xrpAddressIndex: number,
  fromAddress: string,
  destination: string,
  amountDrops: string,
): Promise<string> {
  return signAndSubmitWithWallet(xrpAddressIndex, {
    TransactionType: "Payment",
    Account: fromAddress,
    Destination: destination,
    Amount: amountDrops,
  });
}

export async function disconnect(): Promise<void> {
  if (client?.isConnected()) {
    await client.disconnect();
    client = null;
  }
}
