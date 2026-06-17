import { type BankEnv, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { getTransactionsByAccount } from "@bank/services/transaction.service.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const app = new OpenAPIHono<BankEnv>({ defaultHook: defaultHook() });

app.openapi(
  createRoute({
    method: "get",
    path: "/transactions",
    summary: "List the current account's transactions",
    tags: ["Transaction"],
    security: [{ bearer: [] }],
    middleware: [requireBankAuth],
    responses: {
      200: { content: { "application/json": { schema: z.any() } }, description: "Transactions" },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { accountId } = c.get("bankUser");
    const transactions = await getTransactionsByAccount(accountId);
    return c.json(serializeTimestamps(transactions), 200);
  },
);

export default app;
