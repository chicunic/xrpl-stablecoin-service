import { type BankEnv, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { verifyPin } from "@bank/services/account.service.js";
import { transfer } from "@bank/services/transfer.service.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<BankEnv>({ defaultHook: defaultHook() });

const TransferInput = z
  .object({
    toBranchCode: z.string().regex(/^[0-9]{3}$/, "toBranchCode must be 3 digits"),
    toAccountNumber: z.string().min(1),
    amount: z.number().min(1),
    // Required for session (cookie) auth; not required for API token auth.
    pin: z
      .string()
      .regex(/^[0-9]{4}$/, "pin must be 4 digits")
      .optional(),
    idempotencyKey: z.string().optional(),
  })
  .meta({ id: "TransferInput" });

app.openapi(
  createRoute({
    method: "post",
    path: "/transfers",
    summary: "Transfer funds to another account",
    tags: ["Transfer"],
    security: [{ bearer: [] }],
    middleware: [requireBankAuth],
    request: { body: { content: { "application/json": { schema: TransferInput } }, required: true } },
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Transferred" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { accountId, tokenType } = c.get("bankUser");
    const { toBranchCode, toAccountNumber, amount, pin, idempotencyKey } = c.req.valid("json");

    if (tokenType !== "api") {
      if (!pin) {
        throw new HTTPException(400, { message: "Invalid: pin is required" });
      }
      await verifyPin(accountId, pin);
    }

    const result = await transfer(accountId, toBranchCode, toAccountNumber, amount, idempotencyKey);
    return c.json(serializeTimestamps(result), 200);
  },
);

export default app;
