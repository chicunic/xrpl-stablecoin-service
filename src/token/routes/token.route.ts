import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { PublicTokenViewSchema, TokenAuthorizeResponseSchema } from "@token/config/response-schemas.js";
import { type TokenConfig, getAllTokenConfigs, getTokenConfig } from "@token/config/tokens.js";
import { type AuthEnv, requireAuth } from "@token/middleware/auth.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { holderHasAcceptedCredential } from "@token/services/credential.service.js";
import { createAuthorizationDoc } from "@token/services/token-balance.service.js";
import { authorize, hasMptAuthorization, issuerAuthorize } from "@token/services/xrpl.service.js";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const auth = { security: [{ session: [] }], middleware: [requireAuth] };

const TokenIdParam = z.object({
  tokenId: z.string().meta({ param: { name: "tokenId", in: "path" } }),
});

/** Public-facing projection: strips sensitive signing fields. */
function toPublicTokenView(config: TokenConfig): z.infer<typeof PublicTokenViewSchema> {
  return {
    tokenId: config.tokenId,
    name: config.name,
    domain: config.domain,
    issuerAddress: config.issuerAddress,
    mptIssuanceId: config.mptIssuanceId,
    assetScale: config.assetScale,
    maximumAmount: config.maximumAmount,
    transferFee: config.transferFee,
    permissionedDomainId: config.permissionedDomainId,
  };
}

app.openapi(
  createRoute({
    method: "get",
    path: "/tokens",
    summary: "List token configurations",
    tags: ["Token"],
    ...auth,
    responses: {
      200: { content: { "application/json": { schema: z.array(PublicTokenViewSchema) } }, description: "Tokens" },
      401: jsonError("Unauthorized"),
    },
  }),
  (c) => c.json(getAllTokenConfigs().map(toPublicTokenView), 200),
);

app.openapi(
  createRoute({
    method: "get",
    path: "/tokens/{tokenId}",
    summary: "Get a token configuration",
    tags: ["Token"],
    ...auth,
    request: { params: TokenIdParam },
    responses: {
      200: { content: { "application/json": { schema: PublicTokenViewSchema } }, description: "Token" },
      401: jsonError("Unauthorized"),
    },
  }),
  (c) => {
    const { tokenId } = c.req.valid("param");
    return c.json(toPublicTokenView(getTokenConfig(tokenId)), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/tokens/{tokenId}/authorize",
    summary: "Authorize the current user to hold a token",
    tags: ["Token"],
    ...auth,
    request: { params: TokenIdParam },
    responses: {
      200: { content: { "application/json": { schema: TokenAuthorizeResponseSchema } }, description: "Authorized" },
      400: jsonError("Wallet not set up"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC credential required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { tokenId } = c.req.valid("param");
    const config = getTokenConfig(tokenId);

    const wallet = await getUserWallet(uid);
    if (!wallet) {
      throw new HTTPException(400, { message: "Wallet not set up" });
    }

    // KYC gate: holder must hold a valid on-chain credential the token accepts.
    const kycOk = await holderHasAcceptedCredential(wallet.address, config.acceptedCredentials);
    if (!kycOk) {
      throw new HTTPException(403, { message: "KYC credential required to hold this token" });
    }

    // 1. holder opt-in (idempotent), 2. issuer approve (required by tfMPTRequireAuth)
    const alreadyAuthorized = await hasMptAuthorization(wallet.address, config.mptIssuanceId);
    if (!alreadyAuthorized) {
      await authorize(wallet.bipIndex, wallet.address, config.mptIssuanceId);
    }
    await issuerAuthorize(wallet.address, config.mptIssuanceId, config);
    await createAuthorizationDoc(uid, config.mptIssuanceId);

    return c.json({ tokenId, mptIssuanceId: config.mptIssuanceId, status: "ok" as const }, 200);
  },
);

export default app;
