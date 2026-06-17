import { getFirestore } from "@common/config/firebase.js";
import { ValidationError } from "@common/utils/error.handler.js";

/**
 * Atomically increment a named counter document and return the new value.
 *
 * The counter lives at `{collection}/{counterName}` with shape `{ value: number }`,
 * starting from 0. When `maxValue` is provided, the increment throws
 * `ValidationError` if the next value would exceed it (leaving the counter unchanged).
 */
export async function incrementCounter(collection: string, counterName: string, maxValue?: number): Promise<number> {
  const db = getFirestore();
  const counterRef = db.collection(collection).doc(counterName);

  return db.runTransaction(async (tx) => {
    const counterDoc = await tx.get(counterRef);
    const current = counterDoc.exists ? (counterDoc.data()?.value as number) : 0;
    const next = current + 1;
    if (maxValue !== undefined && next > maxValue) {
      throw new ValidationError(`Invalid: ${counterName} range exceeded`);
    }
    tx.set(counterRef, { value: next });
    return next;
  });
}
