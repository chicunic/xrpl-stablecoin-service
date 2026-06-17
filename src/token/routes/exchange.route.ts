import { MAX_SAFE_AMOUNT } from "@common/utils/amount.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { ExchangeOrderSchema } from "@token/config/response-schemas.js";
import { type AuthEnv, requireAuth, requireKyc } from "@token/middleware/auth.js";
import { exchangeFiatToMpt, exchangeMptToFiat } from "@token/services/exchange.service.js";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const auth = { security: [{ session: [] }], middleware: [requireAuth, requireKyc] };

const FiatToMptSchema = z
  .object({
    tokenId: z.string().min(1),
    fiatAmount: z.number().int().min(1).max(MAX_SAFE_AMOUNT),
  })
  .meta({ id: "FiatToMptInput" });

const MptToFiatSchema = z
  .object({
    tokenId: z.string().min(1),
    tokenAmount: z.number().int().min(1).max(MAX_SAFE_AMOUNT),
  })
  .meta({ id: "MptToFiatInput" });

app.openapi(
  createRoute({
    method: "post",
    path: "/exchange/fiat-to-mpt",
    summary: "Exchange fiat for MPToken",
    tags: ["Exchange"],
    ...auth,
    request: {
      body: { content: { "application/json": { schema: FiatToMptSchema } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: ExchangeOrderSchema } }, description: "Order created" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { tokenId, fiatAmount } = c.req.valid("json");
    const order = await exchangeFiatToMpt(uid, tokenId, fiatAmount);
    return c.json(serializeTimestamps(order), 201);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/exchange/mpt-to-fiat",
    summary: "Exchange MPToken for fiat",
    tags: ["Exchange"],
    ...auth,
    request: {
      body: { content: { "application/json": { schema: MptToFiatSchema } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: ExchangeOrderSchema } }, description: "Order created" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { tokenId, tokenAmount } = c.req.valid("json");
    const order = await exchangeMptToFiat(uid, tokenId, tokenAmount);
    return c.json(serializeTimestamps(order), 201);
  },
);

export default app;
