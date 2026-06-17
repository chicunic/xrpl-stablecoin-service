import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { type AuthEnv, requireAuth } from "@token/middleware/auth.js";
import { generateMfaToken } from "@token/services/mfa-token.service.js";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

app.openapi(
  createRoute({
    method: "post",
    path: "/mfa/verify",
    summary: "Issue a short-lived operation MFA token",
    tags: ["MFA"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ status: z.literal("ok"), mfaToken: z.string(), expiresIn: z.number() }),
          },
        },
        description: "MFA token issued",
      },
      401: jsonError("Unauthorized"),
      403: jsonError("MFA not verified in ID token"),
    },
  }),
  (c) => {
    const { uid, mfaVerified } = c.get("user");
    if (!mfaVerified) {
      throw new HTTPException(403, { message: "MFA not verified in ID token" });
    }
    const mfaToken = generateMfaToken(uid);
    return c.json({ status: "ok" as const, mfaToken, expiresIn: 300 }, 200);
  },
);

export default app;
