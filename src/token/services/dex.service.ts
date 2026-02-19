import { getTokenConfig, toXrplCurrency } from "@token/config/tokens.js";
import { getWalletForSigning } from "@token/services/wallet.service.js";
import { getClient } from "@token/services/xrpl.service.js";
import type { SubmitResponse } from "xrpl";

const tfHybrid = 0x00800000;

function extractTxResult(result: SubmitResponse): { txHash: string; sequence?: number } {
  if (result.result.engine_result !== "tesSUCCESS") {
    throw new Error(`XRPL transaction failed: ${result.result.engine_result_message}`);
  }
  return {
    txHash: result.result.tx_json?.hash ?? "",
    sequence: (result.result.tx_json as any)?.Sequence,
  };
}

export async function createPermissionedOffer(
  bipIndex: number,
  userAddress: string,
  takerGets: { currency: string; value: string; issuer?: string } | string,
  takerPays: { currency: string; value: string; issuer?: string } | string,
  domainId: string,
  flags?: number,
): Promise<{ txHash: string; offerSequence: number }> {
  const xrplClient = await getClient();
  const wallet = await getWalletForSigning(bipIndex);

  const tx: any = {
    TransactionType: "OfferCreate",
    Account: userAddress,
    TakerGets: takerGets,
    TakerPays: takerPays,
    DomainID: domainId,
  };

  if (flags) {
    tx.Flags = flags;
  }

  const prepared = await xrplClient.autofill(tx);
  const signed = wallet.sign(prepared);
  const result: SubmitResponse = await xrplClient.submit(signed.tx_blob);

  const { txHash, sequence } = extractTxResult(result);
  return { txHash, offerSequence: sequence ?? 0 };
}

export async function cancelOffer(bipIndex: number, userAddress: string, offerSequence: number): Promise<string> {
  const xrplClient = await getClient();
  const wallet = await getWalletForSigning(bipIndex);

  const tx = {
    TransactionType: "OfferCancel" as const,
    Account: userAddress,
    OfferSequence: offerSequence,
  };

  const prepared = await xrplClient.autofill(tx);
  const signed = wallet.sign(prepared);
  const result: SubmitResponse = await xrplClient.submit(signed.tx_blob);

  const { txHash } = extractTxResult(result);
  return txHash;
}

export async function getPermissionedOrderBook(
  domainId: string,
  takerGets: { currency: string; issuer?: string },
  takerPays: { currency: string; issuer?: string },
): Promise<{ asks: any[]; bids: any[] }> {
  const xrplClient = await getClient();

  const [askResponse, bidResponse] = await Promise.all([
    xrplClient.request({
      command: "book_offers",
      taker_gets: takerGets,
      taker_pays: takerPays,
    } as any),
    xrplClient.request({
      command: "book_offers",
      taker_gets: takerPays,
      taker_pays: takerGets,
    } as any),
  ]);

  // Filter offers by DomainID
  const filterByDomain = (offers: any[]) => offers.filter((offer: any) => offer.DomainID === domainId);

  return {
    asks: filterByDomain((askResponse.result as any).offers ?? []),
    bids: filterByDomain((bidResponse.result as any).offers ?? []),
  };
}

export function buildOfferAmounts(
  tokenId: string,
  side: "buy" | "sell",
  amount: string,
  price: string,
): { takerGets: any; takerPays: any } {
  const config = getTokenConfig(tokenId);
  const xrplCurrency = toXrplCurrency(config.currency);

  const tokenAmount = {
    currency: xrplCurrency,
    value: amount,
    issuer: config.issuerAddress,
  };

  // price is in XRP drops per token unit
  const xrpAmount = (Number(amount) * Number(price) * 1_000_000).toString();

  if (side === "buy") {
    // buying token: we pay XRP, get token
    return { takerGets: xrpAmount, takerPays: tokenAmount };
  }
  // selling token: we pay token, get XRP
  return { takerGets: tokenAmount, takerPays: xrpAmount };
}

export { tfHybrid };
