import type { BankTransaction } from "@bank/types/bank-transaction.type.js";
import { getFirestore } from "@common/config/firebase.js";

const BANK_TRANSACTIONS_COLLECTION = "bank_transactions";

export async function getTransactionsByAccount(accountId: string): Promise<BankTransaction[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(BANK_TRANSACTIONS_COLLECTION)
    .where("accountId", "==", accountId)
    .orderBy("sequenceNumber", "desc")
    .get();

  return snapshot.docs.map((doc) => doc.data() as BankTransaction);
}
