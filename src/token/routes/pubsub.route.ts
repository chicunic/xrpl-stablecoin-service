import { parsePubSubMessage } from "@common/utils/pubsub.helper.js";
import { defaultHook } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { AckSchema } from "@token/config/response-schemas.js";
import { processBankDeposit } from "@token/services/deposit.service.js";

const app = new OpenAPIHono({ defaultHook: defaultHook() });

interface BankDepositEvent {
  transactionId: string;
  amount: number;
  virtualAccountNumber: string;
}

const PubSubEnvelopeSchema = z
  .object({
    message: z.object({
      data: z.string(),
      messageId: z.string(),
    }),
  })
  .meta({ id: "PubSubEnvelope" });

app.openapi(
  createRoute({
    method: "post",
    path: "/pubsub/bank/deposit",
    summary: "Handle a bank deposit Pub/Sub push message",
    tags: ["Pub/Sub"],
    request: {
      body: { content: { "application/json": { schema: PubSubEnvelopeSchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: AckSchema } }, description: "Acknowledged" },
      500: { content: { "application/json": { schema: AckSchema } }, description: "Processing failed" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    let messageId: string | undefined;
    try {
      const parsed = parsePubSubMessage(body);
      const data = parsed.data as BankDepositEvent;
      messageId = parsed.messageId;

      const { transactionId, amount, virtualAccountNumber } = data;
      if (!transactionId || !amount || !virtualAccountNumber) {
        console.error("Invalid bank deposit event data:", data);
        return c.json({ status: "skipped" as const, reason: "invalid data" }, 200);
      }

      await processBankDeposit(messageId, transactionId, amount, virtualAccountNumber);
      return c.json({ status: "ok" as const }, 200);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 400) {
        console.error("Pub/Sub bank deposit validation error:", error);
        return c.json({ status: "skipped" as const, reason: "validation error" }, 200);
      }
      console.error(`Pub/Sub bank deposit processing error (messageId: ${messageId ?? ""}):`, error);
      return c.json({ error: "Processing failed" }, 500);
    }
  },
);

export default app;
