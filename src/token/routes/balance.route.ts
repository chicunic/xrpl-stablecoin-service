import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  FiatBalanceSchema,
  FiatTransactionSchema,
  MptBalancesResponseSchema,
  MptTransactionSchema,
  TokenAuthorizationStatusSchema,
} from "@token/config/response-schemas.js";
import { getAllTokenConfigs } from "@token/config/tokens.js";
import { type AuthEnv, requireAuth } from "@token/middleware/auth.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { getFiatBalance, getFiatTransactions } from "@token/services/fiat.service.js";
import { getAuthorizations, getMptTransactions } from "@token/services/token-balance.service.js";
import { getMptBalances } from "@token/services/xrpl.service.js";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const auth = { security: [{ session: [] }], middleware: [requireAuth] };

app.openapi(
  createRoute({
    method: "get",
    path: "/balance/fiat",
    summary: "Get the current user's fiat balance",
    tags: ["Balance"],
    ...auth,
    responses: {
      200: { content: { "application/json": { schema: FiatBalanceSchema } }, description: "Fiat balance" },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const balance = await getFiatBalance(uid);
    return c.json({ balance }, 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/balance/mpt",
    summary: "Get the current user's MPToken balances",
    tags: ["Balance"],
    ...auth,
    responses: {
      200: { content: { "application/json": { schema: MptBalancesResponseSchema } }, description: "MPToken balances" },
      400: jsonError("Wallet not set up"),
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const wallet = await getUserWallet(uid);
    if (!wallet) {
      throw new HTTPException(400, { message: "Wallet not set up" });
    }
    const balances = await getMptBalances(wallet.address);
    return c.json(serializeTimestamps({ address: wallet.address, balances }), 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/balance/fiat/transactions",
    summary: "List the current user's fiat transactions",
    tags: ["Balance"],
    ...auth,
    responses: {
      200: {
        content: { "application/json": { schema: z.array(FiatTransactionSchema) } },
        description: "Fiat transactions",
      },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const transactions = await getFiatTransactions(uid);
    return c.json(serializeTimestamps(transactions), 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/balance/mpt/transactions",
    summary: "List the current user's MPToken transactions",
    tags: ["Balance"],
    ...auth,
    responses: {
      200: {
        content: { "application/json": { schema: z.array(MptTransactionSchema) } },
        description: "MPToken transactions",
      },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const transactions = await getMptTransactions(uid);
    return c.json(serializeTimestamps(transactions), 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/balance/authorizations",
    summary: "List per-token authorization status for the current user",
    tags: ["Balance"],
    ...auth,
    responses: {
      200: {
        content: { "application/json": { schema: z.array(TokenAuthorizationStatusSchema) } },
        description: "Authorizations",
      },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");

    const tokens = getAllTokenConfigs();
    const userAuthorizations = await getAuthorizations(uid);
    const authorizationSet = new Set(userAuthorizations.map((a) => a.mptIssuanceId));

    const result = tokens.map((token) => ({
      tokenId: token.tokenId,
      name: token.name,
      issuerAddress: token.issuerAddress,
      mptIssuanceId: token.mptIssuanceId,
      // Guard empty id: an unconfigured issuance must not report as authorized.
      hasAuthorization: token.mptIssuanceId !== "" && authorizationSet.has(token.mptIssuanceId),
    }));

    return c.json(result, 200);
  },
);

export default app;
