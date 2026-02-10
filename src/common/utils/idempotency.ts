import { getFirestore } from "@common/config/firebase.js";

const PROCESSED_MESSAGES_COLLECTION = "token_processed_messages";

export async function checkAndMarkProcessed(messageId: string, type: string): Promise<boolean> {
  const db = getFirestore();
  const docId = `${type}_${messageId}`;
  const docRef = db.collection(PROCESSED_MESSAGES_COLLECTION).doc(docId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(docRef);
    if (doc.exists) {
      return true;
    }
    tx.set(docRef, {
      messageId,
      type,
      processedAt: new Date().toISOString(),
    });
    return false;
  });
}
