import { Timestamp } from "firebase-admin/firestore";

export function firestoreTimestampReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return value;
}

/**
 * Recursively replaces Firestore `Timestamp` values with the ISO `string` they
 * are converted into at runtime, so callers see response-accurate types.
 */
export type Serialized<T> = T extends Timestamp
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

/**
 * Deeply convert Firestore `Timestamp` values to ISO strings. Hono's `c.json()`
 * does not run Express's "json replacer" hook, so call this on response bodies
 * before serializing to avoid leaking `{_seconds,_nanoseconds}`.
 */
export function serializeTimestamps<T>(value: T): Serialized<T> {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString() as Serialized<T>;
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => serializeTimestamps(item)) as Serialized<T>;
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = serializeTimestamps(val);
    }
    return out as Serialized<T>;
  }
  return value as Serialized<T>;
}
