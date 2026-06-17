import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { CredentialAcceptResponseSchema, CredentialStatusSchema } from "@token/config/response-schemas.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { type AuthEnv, requireAuth, requireKyc } from "@token/middleware/auth.js";
import { getUserWallet } from "@token/services/auth.service.js";
import {
  CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  acceptCredential,
  getCredentialStatus,
  issueCredential,
} from "@token/services/credential.service.js";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const auth = { security: [{ session: [] }], middleware: [requireAuth, requireKyc] };

app.openapi(
  createRoute({
    method: "get",
    path: "/users/me/credential",
    summary: "Get the current user's KYC credential status",
    tags: ["Credential"],
    ...auth,
    responses: {
      200: { content: { "application/json": { schema: CredentialStatusSchema } }, description: "Credential status" },
      401: jsonError("Unauthorized"),
      403: jsonError("KYC required"),
      404: jsonError("Wallet not found"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const wallet = await getUserWallet(uid);
    if (!wallet) {
      throw new HTTPException(404, { message: "Wallet not found" });
    }

    const { issuerAddress } = getTokenConfig("JPYN");
    const status = await getCredentialStatus(wallet.address, issuerAddress, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
    return c.json(serializeTimestamps(status), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/users/me/credential/retry",
    summary: "Retry issuing and accepting the current user's KYC credential",
    tags: ["Credential"],
    ...auth,
    responses: {
      200: {
        content: { "application/json": { schema: CredentialAcceptResponseSchema } },
        description: "Credential accepted",
      },
      401: jsonError("Unauthorized"),
      403: jsonError("KYC required"),
      404: jsonError("Wallet not found"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const wallet = await getUserWallet(uid);
    if (!wallet) {
      throw new HTTPException(404, { message: "Wallet not found" });
    }

    const { issuerAddress } = getTokenConfig("JPYN");
    const credentialTxHash = await issueCredential(wallet.address, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
    const credentialAcceptTxHash = await acceptCredential(
      wallet.bipIndex,
      wallet.address,
      issuerAddress,
      CREDENTIAL_TYPE_KYC_JAPAN_HEX,
    );

    return c.json({ credentialTxHash, credentialAcceptTxHash, credentialStatus: "accepted" as const }, 200);
  },
);

export default app;
