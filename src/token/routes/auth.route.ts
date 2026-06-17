import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { UserResponseSchema, VirtualAccountSchema } from "@token/config/response-schemas.js";
import { type AuthEnv, requireAuth } from "@token/middleware/auth.js";
import { getOrCreateUser, getVirtualAccount, setupVirtualAccount, setupWallet } from "@token/services/auth.service.js";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

app.openapi(
  createRoute({
    method: "get",
    path: "/users/me",
    summary: "Get or create the current user",
    tags: ["User"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    responses: {
      200: { content: { "application/json": { schema: UserResponseSchema } }, description: "User" },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid, email, name } = c.get("user");
    const user = await getOrCreateUser(uid, email, name);
    return c.json(serializeTimestamps(user), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/users/me/wallet",
    summary: "Set up the current user's wallet",
    tags: ["User"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    responses: {
      201: {
        content: { "application/json": { schema: z.object({ address: z.string() }) } },
        description: "Wallet created",
      },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const wallet = await setupWallet(uid);
    return c.json({ address: wallet.address }, 201);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/users/me/virtual-account",
    summary: "Get the current user's virtual account",
    tags: ["User"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    responses: {
      200: { content: { "application/json": { schema: VirtualAccountSchema } }, description: "Virtual account" },
      401: jsonError("Unauthorized"),
      404: jsonError("Virtual account not found"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const va = await getVirtualAccount(uid);
    if (!va) {
      throw new HTTPException(404, { message: "Virtual account not found" });
    }
    return c.json(serializeTimestamps(va), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/users/me/virtual-account",
    summary: "Set up the current user's virtual account",
    tags: ["User"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    responses: {
      201: {
        content: { "application/json": { schema: VirtualAccountSchema } },
        description: "Virtual account created",
      },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const virtualAccount = await setupVirtualAccount(uid);
    return c.json(serializeTimestamps(virtualAccount), 201);
  },
);

export default app;
