import { ValidationError } from "@common/utils/error.handler.js";

/**
 * Upper bound for any amount that flows through a JS `number` and into Firestore.
 *
 * Firestore stores 64-bit integers, but JS `number` only represents integers
 * exactly up to 2^53-1. Once an amount round-trips through `number`, that is the
 * real safe ceiling — not 2^63. Every amount in this system is an integer
 * (JPY has no minor unit; MPToken `value` is an integer string), so amounts are
 * validated with `Number.isSafeInteger`. The only non-integer ledger quantity is
 * native XRP, which is never represented as a `number` here (it stays a drops string).
 */
export const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;

/**
 * Assert that `value` is a positive, safe integer amount (0 < value <= 2^53-1).
 * Returns the value narrowed to `number`, or throws `ValidationError`.
 */
export function assertSafeAmount(value: number, label = "amount"): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`Invalid: ${label} must be a positive integer not exceeding ${String(MAX_SAFE_AMOUNT)}`);
  }
  return value;
}

/** Like `assertSafeAmount` but returns a boolean instead of throwing. */
export function isSafeAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
