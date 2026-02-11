import { randomUUID } from "node:crypto";
import { getFirestore } from "@common/config/firebase.js";
import { getAllTokenConfigs, toXrplCurrency } from "@token/config/tokens.js";
import { getUserByVirtualAccountNumber, getUserByWalletAddress } from "@token/services/auth.service.js";
import { FieldValue } from "firebase-admin/firestore";

const USERS_COLLECTION = "token_users";
const PROCESSED_MESSAGES_COLLECTION = "token_processed_messages";

export async function processBankDeposit(
  messageId: string,
  bankTransactionId: string,
  amount: number,
  virtualAccountNumber: string,
): Promise<void> {
  const user = await getUserByVirtualAccountNumber(virtualAccountNumber);
  if (!user) {
    console.warn(`No user found for virtual account: ${virtualAccountNumber}, txId: ${bankTransactionId}`);
    return;
  }

  const db = getFirestore();
  const idempotencyDocId = `bank-deposit_${messageId}`;
  const idempotencyRef = db.collection(PROCESSED_MESSAGES_COLLECTION).doc(idempotencyDocId);
  const userRef = db.collection(USERS_COLLECTION).doc(user.uid);
  const transactionId = randomUUID();

  await db.runTransaction(async (tx) => {
    const [idempotencyDoc, userDoc] = await Promise.all([tx.get(idempotencyRef), tx.get(userRef)]);

    if (idempotencyDoc.exists) {
      return; // already processed
    }

    if (!userDoc.exists) {
      throw new Error(`User document not found: ${user.uid}`);
    }

    const currentBalance = (userDoc.data()?.fiatBalance as number) ?? 0;
    const newBalance = currentBalance + amount;

    tx.update(userRef, { fiatBalance: newBalance });

    const txRef = userRef.collection("fiatTransactions").doc(transactionId);
    tx.set(txRef, {
      transactionId,
      type: "deposit",
      amount,
      balance: newBalance,
      description: "JPY 入金",
      relatedOrderId: bankTransactionId,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(idempotencyRef, {
      messageId,
      type: "bank-deposit",
      processedAt: new Date().toISOString(),
    });
  });

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

  const db = getFirestore();
  const idempotencyRef = db.collection(PROCESSED_MESSAGES_COLLECTION).doc(`xrpl-deposit_${txHash}`);
  const userRef = db.collection(USERS_COLLECTION).doc(user.uid);
  const transactionId = randomUUID();

  await db.runTransaction(async (tx) => {
    const idempotencyDoc = await tx.get(idempotencyRef);
    if (idempotencyDoc.exists) {
      return; // already processed
    }

    const txRef = userRef.collection("xrpTransactions").doc(transactionId);
    tx.set(txRef, {
      transactionId,
      tokenId: tokenConfig.tokenId,
      type: "deposit",
      amount,
      description: `${tokenConfig.currency} 入金`,
      relatedOrderId: txHash,
      txHash,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(idempotencyRef, {
      messageId: txHash,
      type: "xrpl-deposit",
      processedAt: new Date().toISOString(),
    });
  });

  console.log(
    `XRPL token deposit credited: userId=${user.uid}, token=${tokenConfig.tokenId}, amount=${amount}, txHash=${txHash}`,
  );

  return { processed: true };
}
