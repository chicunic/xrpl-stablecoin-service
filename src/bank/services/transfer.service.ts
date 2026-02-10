import { randomUUID } from "node:crypto";
import { getAccountByBranchAndNumber, getAccountById } from "@bank/services/account.service.js";
import { getVirtualAccountByBranchAndNumber } from "@bank/services/virtual-account.service.js";
import type { Counterparty } from "@bank/types/bank-transaction.type.js";
import { getFirestore } from "@common/config/firebase.js";
import { BANK_DEPOSIT_TOPIC, publishMessage } from "@common/config/pubsub.js";
import { NotFoundError, ValidationError } from "@common/utils/error.handler.js";
import { FieldValue } from "firebase-admin/firestore";

const BANK_ACCOUNTS_COLLECTION = "bank_accounts";
const BANK_TRANSACTIONS_COLLECTION = "bank_transactions";

function validatePositiveAmount(amount: number): void {
  if (amount <= 0) {
    throw new ValidationError("Invalid: amount must be positive");
  }
}

async function atmTransaction(
  accountId: string,
  amount: number,
  type: "atm_in" | "atm_out",
): Promise<{ balance: number }> {
  validatePositiveAmount(amount);

  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const accountRef = db.collection(BANK_ACCOUNTS_COLLECTION).doc(accountId);
    const accountDoc = await tx.get(accountRef);

    if (!accountDoc.exists) {
      throw new NotFoundError("Account not found");
    }

    const account = accountDoc.data()!;
    const currentBalance = account.balance as number;

    if (type === "atm_out" && currentBalance < amount) {
      throw new ValidationError("Invalid: insufficient balance");
    }

    const newBalance = type === "atm_in" ? currentBalance + amount : currentBalance - amount;
    const newSeq = ((account.transactionSequence as number) || 0) + 1;

    tx.update(accountRef, {
      balance: newBalance,
      transactionSequence: newSeq,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const txRef = db.collection(BANK_TRANSACTIONS_COLLECTION).doc(randomUUID());
    tx.set(txRef, {
      transactionId: txRef.id,
      accountId,
      type,
      amount,
      balance: newBalance,
      counterparty: null,
      sequenceNumber: newSeq,
      description: "カード",
      createdAt: FieldValue.serverTimestamp(),
    });

    return { balance: newBalance };
  });
}

export async function deposit(accountId: string, amount: number): Promise<{ balance: number }> {
  return atmTransaction(accountId, amount, "atm_in");
}

export async function withdraw(accountId: string, amount: number): Promise<{ balance: number }> {
  return atmTransaction(accountId, amount, "atm_out");
}

export async function transfer(
  fromAccountId: string,
  toBranchCode: string,
  toAccountNumber: string,
  amount: number,
  idempotencyKey?: string,
): Promise<{ balance: number; transactionId: string }> {
  validatePositiveAmount(amount);

  // Idempotency check: return cached result if already processed
  if (idempotencyKey) {
    const db = getFirestore();
    const idempotencyRef = db.collection("bank_processed_transfers").doc(idempotencyKey);
    const existing = await idempotencyRef.get();
    if (existing.exists) {
      const data = existing.data()!;
      return { balance: data.balance as number, transactionId: data.transactionId as string };
    }
  }

  let toAccount = await getAccountByBranchAndNumber(toBranchCode, toAccountNumber);
  let virtualAccountNumber: string | undefined;
  let virtualAccountLabel: string | undefined;

  if (!toAccount) {
    const virtualAccount = await getVirtualAccountByBranchAndNumber(toBranchCode, toAccountNumber);
    if (!virtualAccount || !virtualAccount.isActive) {
      throw new ValidationError("Invalid: destination account not found");
    }
    const parentAccount = await getAccountById(virtualAccount.parentAccountId);
    if (!parentAccount) {
      throw new ValidationError("Invalid: destination account not found");
    }
    toAccount = parentAccount;
    virtualAccountNumber = virtualAccount.accountNumber;
    virtualAccountLabel = virtualAccount.label;
  }

  if (fromAccountId === toAccount.accountId) {
    throw new ValidationError("Invalid: cannot transfer to the same account");
  }

  const db = getFirestore();
  const result = await db.runTransaction(async (tx) => {
    const fromRef = db.collection(BANK_ACCOUNTS_COLLECTION).doc(fromAccountId);
    const toRef = db.collection(BANK_ACCOUNTS_COLLECTION).doc(toAccount.accountId);

    const fromDoc = await tx.get(fromRef);
    const toDoc = await tx.get(toRef);

    if (!fromDoc.exists) {
      throw new NotFoundError("Account not found");
    }
    if (!toDoc.exists) {
      throw new ValidationError("Invalid: destination account not found");
    }

    const fromData = fromDoc.data()!;
    const toData = toDoc.data()!;

    const fromBalance = fromData.balance as number;
    if (fromBalance < amount) {
      throw new ValidationError("Invalid: insufficient balance");
    }

    const senderNewBalance = fromBalance - amount;
    const senderNewSeq = ((fromData.transactionSequence as number) || 0) + 1;

    const receiverNewBalance = (toData.balance as number) + amount;
    const receiverNewSeq = ((toData.transactionSequence as number) || 0) + 1;

    tx.update(fromRef, {
      balance: senderNewBalance,
      transactionSequence: senderNewSeq,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(toRef, {
      balance: receiverNewBalance,
      transactionSequence: receiverNewSeq,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const senderCounterparty: Counterparty = {
      bankCode: toAccount.bankCode,
      branchCode: toAccount.branchCode,
      accountNumber: toAccount.accountNumber,
      accountHolder: toAccount.accountHolder,
    };

    const receiverCounterparty: Counterparty = {
      bankCode: fromData.bankCode as string,
      branchCode: fromData.branchCode as string,
      accountNumber: fromData.accountNumber as string,
      accountHolder: fromData.accountHolder as string,
    };

    const senderTxId = randomUUID();
    const senderTxRef = db.collection(BANK_TRANSACTIONS_COLLECTION).doc(senderTxId);
    tx.set(senderTxRef, {
      transactionId: senderTxId,
      accountId: fromAccountId,
      type: "transfer_out",
      amount,
      balance: senderNewBalance,
      counterparty: senderCounterparty,
      sequenceNumber: senderNewSeq,
      description: `振込 ${toAccount.accountHolder}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    const receiverTxRef = db.collection(BANK_TRANSACTIONS_COLLECTION).doc(randomUUID());
    const receiverTxData: Record<string, unknown> = {
      transactionId: receiverTxRef.id,
      accountId: toAccount.accountId,
      type: "transfer_in",
      amount,
      balance: receiverNewBalance,
      counterparty: receiverCounterparty,
      sequenceNumber: receiverNewSeq,
      description: `振込 ${fromData.accountHolder as string}`,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (virtualAccountNumber) {
      receiverTxData.virtualAccountNumber = virtualAccountNumber;
      receiverTxData.virtualAccountLabel = virtualAccountLabel;
    }
    tx.set(receiverTxRef, receiverTxData);

    return { balance: senderNewBalance, transactionId: senderTxId };
  });

  // Record idempotency key after successful transaction
  if (idempotencyKey) {
    const db = getFirestore();
    await db.collection("bank_processed_transfers").doc(idempotencyKey).set({
      transactionId: result.transactionId,
      balance: result.balance,
      fromAccountId,
      amount,
      processedAt: FieldValue.serverTimestamp(),
    });
  }

  if (toAccount.pubsubEnabled) {
    const messageData: Record<string, unknown> = {
      transactionId: result.transactionId,
      toAccountId: toAccount.accountId,
      amount,
    };
    if (virtualAccountNumber) {
      messageData.virtualAccountNumber = virtualAccountNumber;
    }
    publishMessage(BANK_DEPOSIT_TOPIC, messageData).catch((err) => {
      console.error("Failed to publish bank deposit event:", err);
    });
  }

  return result;
}
