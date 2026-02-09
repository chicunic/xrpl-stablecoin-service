import { Timestamp } from "firebase-admin/firestore";

export function firestoreTimestampReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return value;
}
