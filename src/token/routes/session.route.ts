import { getProjectAuth } from "@token/middleware/auth.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { extractBearerToken } from "@common/utils/auth-header.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";

const app = new OpenAPIHono({ defaultHook: defaultHook() });

const SESSION_EXPIRES_IN = 14 * 24 * 60 * 60 * 1000; // 14 days
const AUTH_TIME_MAX_AGE = 5 * 60; // 5 minutes

const IdTokenSchema = z
  .object({
    idToken: z.string().min(1).meta({ description: "Firebase ID token" }),
  })
  .meta({ id: "SessionIdToken" });

const SessionResponseSchema = z
  .object({
    status: z.literal("ok"),
    sessionToken: z.string(),
  })
  .meta({ id: "SessionResponse" });

app.openapi(
  createRoute({
    method: "post",
    path: "/session/login",
    summary: "Create a session from a Firebase ID token",
    tags: ["Session"],
    request: {
      body: { content: { "application/json": { schema: IdTokenSchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: SessionResponseSchema } }, description: "Session created" },
      400: jsonError("Validation error"),
      401: jsonError("Recent sign-in required"),
    },
  }),
  async (c) => {
    const { idToken } = c.req.valid("json");

    const decoded = await getProjectAuth().verifyIdToken(idToken);
    const authTime = decoded.auth_time;
    const now = Math.floor(Date.now() / 1000);
    if (now - authTime > AUTH_TIME_MAX_AGE) {
      throw new HTTPException(401, { message: "Recent sign-in required" });
    }

    const sessionToken = await getProjectAuth().createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN });
    return c.json({ status: "ok" as const, sessionToken }, 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/session/refresh",
    summary: "Refresh an existing session",
    tags: ["Session"],
    request: {
      body: { content: { "application/json": { schema: IdTokenSchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: SessionResponseSchema } }, description: "Session refreshed" },
      400: jsonError("Validation error"),
      401: jsonError("No existing session"),
    },
  }),
  async (c) => {
    const existingSession = extractBearerToken(c.req.header("authorization"));
    if (!existingSession) {
      throw new HTTPException(401, { message: "No existing session" });
    }

    // Verify the existing session is valid
    await getProjectAuth().verifySessionCookie(existingSession, true);

    const { idToken } = c.req.valid("json");
    const sessionToken = await getProjectAuth().createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN });
    return c.json({ status: "ok" as const, sessionToken }, 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/session/logout",
    summary: "Log out (client-side session clear)",
    tags: ["Session"],
    responses: {
      200: { content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } }, description: "OK" },
    },
  }),
  (c) => c.json({ status: "ok" as const }, 200),
);

export default app;
