import { MAX_SAFE_AMOUNT } from "@common/utils/amount.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { FiatWithdrawalResultSchema, MptWithdrawalResultSchema } from "@token/config/response-schemas.js";
import { BankAccountFields, XRPL_ADDRESS_REGEX } from "@token/config/schemas.js";
import { type AuthEnv, requireAuth, requireKyc, requireMfa, requireOperationMfa } from "@token/middleware/auth.js";
import { withdrawFiat, withdrawMpt } from "@token/services/withdrawal.service.js";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const writeAuth = {
  security: [{ session: [] }],
  middleware: [requireAuth, requireKyc, requireMfa, requireOperationMfa],
};

const BankAccountSchema = z
  .object({
    ...BankAccountFields,
    label: z.string(),
  })
  .meta({ id: "WithdrawalBankAccount" });

const WithdrawFiatInput = z
  .object({
    amount: z.number().int().min(1).max(MAX_SAFE_AMOUNT),
    bankAccount: BankAccountSchema,
  })
  .meta({ id: "WithdrawFiatInput" });

const WithdrawMptInput = z
  .object({
    tokenId: z.string().min(1),
    tokenAmount: z.number().int().min(1).max(MAX_SAFE_AMOUNT),
    destinationAddress: z.string().regex(XRPL_ADDRESS_REGEX, "destinationAddress must be a valid XRPL address"),
  })
  .meta({ id: "WithdrawMptInput" });

app.openapi(
  createRoute({
    method: "post",
    path: "/withdraw/fiat",
    summary: "Withdraw fiat to a bank account",
    tags: ["Withdrawal"],
    ...writeAuth,
    request: { body: { content: { "application/json": { schema: WithdrawFiatInput } }, required: true } },
    responses: {
      201: {
        content: { "application/json": { schema: FiatWithdrawalResultSchema } },
        description: "Withdrawal created",
      },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC/MFA required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { amount, bankAccount } = c.req.valid("json");
    const result = await withdrawFiat(uid, amount, bankAccount);
    return c.json(serializeTimestamps(result), 201);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/withdraw/mpt",
    summary: "Withdraw MPToken to an XRPL address",
    tags: ["Withdrawal"],
    ...writeAuth,
    request: { body: { content: { "application/json": { schema: WithdrawMptInput } }, required: true } },
    responses: {
      201: {
        content: { "application/json": { schema: MptWithdrawalResultSchema } },
        description: "Withdrawal created",
      },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC/MFA required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { tokenId, tokenAmount, destinationAddress } = c.req.valid("json");
    const result = await withdrawMpt(uid, tokenId, tokenAmount, destinationAddress);
    return c.json(serializeTimestamps(result), 201);
  },
);

export default app;
