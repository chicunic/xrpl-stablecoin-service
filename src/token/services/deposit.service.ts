import { randomUUID } from "node:crypto";
import { isSafeAmount } from "@common/utils/amount.js";
import { getFirestore } from "@common/config/firebase.js";
import { getAllTokenConfigs } from "@token/config/tokens.js";
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

    const currentBalance = (userDoc.data()?.fiatBalance as number | undefined) ?? 0;
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

  console.log(`Fiat deposit credited: userId=${user.uid}, amount=${String(amount)}, txId=${bankTransactionId}`);
}

interface MptAmount {
  mpt_issuance_id: string;
  value: string;
}

interface TokenTransactionData {
  transactionType: string;
  tx_json: {
    Account: string;
    Destination: string;
    Amount: MptAmount | string;
  };
  meta: {
    TransactionResult: string;
    delivered_amount?: MptAmount | string;
  };
}

export async function processXrplTokenTransaction(
  txHash: string,
  data: TokenTransactionData,
): Promise<{ processed: boolean; reason?: string }> {
  if (data.meta.TransactionResult !== "tesSUCCESS") {
    return { processed: false, reason: "transaction not successful" };
  }

  // Only mint (issuer -> user) and transfer (user -> user) credit someone; burn (user -> issuer) credits no one.
  if (data.transactionType === "burn") {
    return { processed: false, reason: "burn transaction" };
  }

  const destination = data.tx_json.Destination;
  const deliveredAmount = data.meta.delivered_amount;

  if (!deliveredAmount || typeof deliveredAmount === "string") {
    return { processed: false, reason: "no token amount (XRP native)" };
  }

  // Guard empty ids: an unconfigured JPYN_MPT_ISSUANCE_ID ("") must not falsely match a delivered_amount with an empty/missing id.
  const deliveredId = deliveredAmount.mpt_issuance_id;
  if (!deliveredId) {
    return { processed: false, reason: "missing mpt_issuance_id" };
  }
  const tokenConfigs = getAllTokenConfigs();
  const tokenConfig = tokenConfigs.find((t) => t.mptIssuanceId !== "" && t.mptIssuanceId === deliveredId);
  if (!tokenConfig) {
    return { processed: false, reason: "unknown token" };
  }

  // Find the user who owns the destination wallet
  const user = await getUserByWalletAddress(destination);
  if (!user) {
    return { processed: false, reason: "destination is not a custodial wallet" };
  }

  // string -> number boundary: reject the integer-string MPToken value if it would lose precision as a JS number (> 2^53-1), NaN, or <= 0.
  const amount = Number(deliveredAmount.value);
  if (!isSafeAmount(amount)) {
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
      description: `${tokenConfig.name} 入金`,
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
    `XRPL token deposit credited: userId=${user.uid}, token=${tokenConfig.tokenId}, amount=${String(amount)}, txHash=${txHash}`,
  );

  return { processed: true };
}
