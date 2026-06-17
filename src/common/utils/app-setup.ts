import { AppError, appErrorToProblem } from "@common/utils/error.handler.js";
import { problemResponse } from "@common/utils/problem.js";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

/** Apply the security middleware, RFC 9457 error handling, and health check shared by both services. */
export function setupAppBaseline(app: OpenAPIHono, allowedOrigins: string[]): void {
  app.use("*", secureHeaders());
  app.use("*", cors({ origin: allowedOrigins }));

  app.notFound((c) => problemResponse(c, 404, "Not found"));

  app.onError((err, c) => {
    if (err instanceof AppError) return appErrorToProblem(err, c);
    if (err instanceof HTTPException) return problemResponse(c, err.status, err.message);
    console.error("Unhandled error:", err);
    return problemResponse(c, 500, "Internal server error");
  });

  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
}
