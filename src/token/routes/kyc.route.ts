import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { KycInfoSchema } from "@token/config/response-schemas.js";
import { type AuthEnv, requireAuth } from "@token/middleware/auth.js";
import { submitKyc } from "@token/services/kyc.service.js";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const KycInputSchema = z
  .object({
    fullName: z.string().min(1),
    phoneNumber: z.string().regex(/^0\d{9,10}$/, "phoneNumber must be a Japanese phone number"),
    postalCode: z.string().regex(/^\d{7}$/, "postalCode must be 7 digits"),
    prefecture: z.string().min(1),
    city: z.string().min(1),
    // town (zipcloud address3) can be empty
    town: z.string(),
    address: z.string().min(1),
  })
  .meta({ id: "KycInput" });

app.openapi(
  createRoute({
    method: "post",
    path: "/users/me/kyc",
    summary: "Submit KYC information",
    tags: ["KYC"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    request: {
      body: { content: { "application/json": { schema: KycInputSchema } }, required: true },
    },
    responses: {
      201: { content: { "application/json": { schema: KycInfoSchema } }, description: "KYC submitted" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const input = c.req.valid("json");
    const kyc = await submitKyc(uid, input);
    return c.json(serializeTimestamps(kyc), 201);
  },
);

export default app;
