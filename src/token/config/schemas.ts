import { z } from "@hono/zod-openapi";

/** Classic XRPL account address (base58, r-prefixed). */
export const XRPL_ADDRESS_REGEX = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

/** Japanese bank account fields with their digit-count validation, shared by withdrawal and whitelist routes. */
export const BankAccountFields = {
  bankCode: z.string().regex(/^\d{4}$/, "bankCode must be 4 digits"),
  branchCode: z.string().regex(/^\d{3}$/, "branchCode must be 3 digits"),
  accountNumber: z.string().regex(/^\d{7}$/, "accountNumber must be 7 digits"),
  accountHolder: z.string().min(1),
};
