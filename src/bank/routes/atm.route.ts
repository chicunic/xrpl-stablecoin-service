import { type BankEnv, rejectApiToken, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { verifyPin } from "@bank/services/account.service.js";
import { deposit, withdraw } from "@bank/services/transfer.service.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const app = new OpenAPIHono<BankEnv>({ defaultHook: defaultHook() });

const protectedRoute = { security: [{ bearer: [] }], middleware: [requireBankAuth, rejectApiToken] };

const AtmInput = z
  .object({
    amount: z.number().min(1),
    pin: z.string().regex(/^[0-9]{4}$/, "pin must be 4 digits"),
  })
  .meta({ id: "AtmInput" });

app.openapi(
  createRoute({
    method: "post",
    path: "/atm/deposit",
    summary: "Deposit cash via ATM",
    tags: ["ATM"],
    ...protectedRoute,
    request: { body: { content: { "application/json": { schema: AtmInput } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Deposited" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    const { amount, pin } = c.req.valid("json");
    await verifyPin(accountId, pin);
    const result = await deposit(accountId, amount);
    return c.json(serializeTimestamps(result), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/atm/withdrawal",
    summary: "Withdraw cash via ATM",
    tags: ["ATM"],
    ...protectedRoute,
    request: { body: { content: { "application/json": { schema: AtmInput } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Withdrawn" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    const { amount, pin } = c.req.valid("json");
    await verifyPin(accountId, pin);
    const result = await withdraw(accountId, amount);
    return c.json(serializeTimestamps(result), 200);
  },
);

export default app;
