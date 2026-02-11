import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import { NotFoundError } from "@common/utils/error.handler.js";
import { getTokenConfig, type TokenConfig } from "@token/config/tokens.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { creditFiat, debitFiat } from "@token/services/fiat.service.js";
import { createTrustlineDoc, recordXrpTransaction } from "@token/services/token-balance.service.js";
import { ensureTrustLine } from "@token/services/trustline.service.js";
import { sendToken, sendTokenFromUser } from "@token/services/xrpl.service.js";
import type { ExchangeOrder } from "@token/types/exchange-order.type.js";
import type { Wallet } from "@token/types/user.type.js";
import { FieldValue } from "firebase-admin/firestore";

const ORDERS_COLLECTION = "token_exchange_orders";

async function createOrder(
  userId: string,
  tokenId: string,
  direction: ExchangeOrder["direction"],
  amount: number,
): Promise<string> {
  const db = getFirestore();
  const orderId = randomUUID();
  const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);

  await orderRef.set({
    orderId,
    userId,
    tokenId,
    direction,
    amount,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return orderId;
}

async function updateOrderStatus(
  orderId: string,
  status: ExchangeOrder["status"],
  extra?: { xrplTxHash?: string; failureReason?: string },
): Promise<void> {
  const db = getFirestore();
  await db
    .collection(ORDERS_COLLECTION)
    .doc(orderId)
    .update({
      status,
      ...extra,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

async function getOrder(orderId: string): Promise<ExchangeOrder> {
  const db = getFirestore();
  const doc = await db.collection(ORDERS_COLLECTION).doc(orderId).get();
  return doc.data() as ExchangeOrder;
}

async function resolveTokenAndWallet(
  tokenId: string,
  userId: string,
): Promise<{ token: TokenConfig; tokenConfig: TokenConfig; wallet: Wallet }> {
  const tokenConfig = getTokenConfig(tokenId);

  const wallet = await getUserWallet(userId);
  if (!wallet) {
    throw new NotFoundError("Wallet not set up");
  }

  return { token: tokenConfig, tokenConfig, wallet };
}

/**
 * fiat -> token flow:
 * 1. Create order (pending)
 * 2. Debit fiat (fiat_debited)
 * 3. Send token on XRPL (completed)
 * On XRPL failure: refund fiat (failed)
 */
export async function exchangeFiatToToken(userId: string, tokenId: string, fiatAmount: number): Promise<ExchangeOrder> {
  const { token, tokenConfig, wallet } = await resolveTokenAndWallet(tokenId, userId);

  // 1:1 fixed rate for stablecoin
  const tokenAmount = fiatAmount;

  const orderId = await createOrder(userId, tokenId, "fiat_to_token", fiatAmount);

  try {
    await debitFiat(userId, fiatAmount, "exchange_out", `JPY -> ${token.currency}`, orderId);
    await updateOrderStatus(orderId, "fiat_debited");
  } catch (error) {
    await updateOrderStatus(orderId, "failed", {
      failureReason: `Fiat debit failed: ${(error as Error).message}`,
    });
    throw error;
  }

  try {
    await ensureTrustLine(wallet.bipIndex, wallet.address, token.currency, token.issuerAddress);
    await createTrustlineDoc(userId, token.currency, token.issuerAddress);

    const txHash = await sendToken(
      wallet.address,
      token.currency,
      tokenAmount.toString(),
      tokenConfig.issuerAddress,
      tokenConfig.kmsKeyPath,
      tokenConfig.signingPublicKey,
    );

    await recordXrpTransaction(
      userId,
      tokenId,
      "exchange_in",
      tokenAmount,
      `JPY -> ${token.currency}`,
      txHash,
      orderId,
    );

    await updateOrderStatus(orderId, "completed", { xrplTxHash: txHash });
  } catch (error) {
    await creditFiat(userId, fiatAmount, "exchange_in", `JPY -> ${token.currency} 返金`, orderId);
    await updateOrderStatus(orderId, "failed", {
      failureReason: `XRPL mint failed: ${(error as Error).message}`,
    });
    throw error;
  }

  return getOrder(orderId);
}

/**
 * token -> fiat flow:
 * 1. Create order (pending)
 * 2. Burn token on XRPL (token_burned)
 * 3. Debit token balance + credit fiat (completed)
 * On XRPL failure: no balance change (failed)
 */
export async function exchangeTokenToFiat(
  userId: string,
  tokenId: string,
  tokenAmount: number,
): Promise<ExchangeOrder> {
  const { token, wallet } = await resolveTokenAndWallet(tokenId, userId);

  // 1:1 fixed rate for stablecoin
  const fiatAmount = tokenAmount;

  const orderId = await createOrder(userId, tokenId, "token_to_fiat", tokenAmount);

  let txHash: string;
  try {
    txHash = await sendTokenFromUser(
      wallet.bipIndex,
      wallet.address,
      token.issuerAddress,
      token.currency,
      tokenAmount.toString(),
      token.issuerAddress,
    );
    await updateOrderStatus(orderId, "token_burned", { xrplTxHash: txHash });
  } catch (error) {
    await updateOrderStatus(orderId, "failed", {
      failureReason: `XRPL burn failed: ${(error as Error).message}`,
    });
    throw error;
  }

  try {
    await recordXrpTransaction(
      userId,
      tokenId,
      "exchange_out",
      tokenAmount,
      `${token.currency} -> JPY`,
      txHash,
      orderId,
    );

    await creditFiat(userId, fiatAmount, "exchange_in", `${token.currency} -> JPY`, orderId);

    await updateOrderStatus(orderId, "completed");
  } catch (error) {
    await updateOrderStatus(orderId, "failed", {
      failureReason: `Balance update failed after burn: ${(error as Error).message}`,
    });
    throw error;
  }

  return getOrder(orderId);
}
