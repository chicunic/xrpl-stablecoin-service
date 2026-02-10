import path from "node:path";
import { initializeFirebase } from "@common/config/firebase.js";
import { firestoreTimestampReplacer } from "@common/utils/json.replacer.js";
import authRoutes from "@token/routes/auth.route.js";
import balanceRoutes from "@token/routes/balance.route.js";
import eventarcRoutes from "@token/routes/eventarc.route.js";
import exchangeRoutes from "@token/routes/exchange.route.js";
import kycRoutes from "@token/routes/kyc.route.js";
import mfaRoutes from "@token/routes/mfa.route.js";
import pubsubRoutes from "@token/routes/pubsub.route.js";
import sessionRoutes from "@token/routes/session.route.js";
import tokenRoutes from "@token/routes/token.route.js";
import whitelistRoutes from "@token/routes/whitelist.route.js";
import withdrawalRoutes from "@token/routes/withdrawal.route.js";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import OpenApiValidator from "express-openapi-validator";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./swagger.json" with { type: "json" };

dotenv.config();

process.env.NODE_ENV ??= "development";

initializeFirebase();

const app: Express = express();
const port = process.env.PORT ?? 8080;

const allowedOrigins = [
  process.env.CORS_ORIGIN ?? "http://localhost:5173",
  "https://xrpl-token.web.app",
  "https://xrpl-token.firebaseapp.com",
];

app.set("json replacer", firestoreTimestampReplacer);
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

if (process.env.NODE_ENV === "development") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

app.use(
  OpenApiValidator.middleware({
    apiSpec: path.join(import.meta.dirname, "./swagger.json"),
    validateRequests: true,
    validateResponses: false,
    ignorePaths: /(.*\/api-docs.*|.*\.well-known.*)/,
  }),
);

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1", sessionRoutes);
app.use("/api/v1", authRoutes);
app.use("/api/v1", kycRoutes);
app.use("/api/v1", mfaRoutes);
app.use("/api/v1", tokenRoutes);
app.use("/api/v1", pubsubRoutes);
app.use("/api/v1", eventarcRoutes);
app.use("/api/v1", balanceRoutes);
app.use("/api/v1", exchangeRoutes);
app.use("/api/v1", whitelistRoutes);
app.use("/api/v1", withdrawalRoutes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const errorObj = err as { status?: number; message?: string; errors?: unknown };

  if (errorObj.status && errorObj.status < 500) {
    res.status(errorObj.status).json({
      error: errorObj.message ?? "Validation error",
      details: errorObj.errors,
    });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port} (${process.env.NODE_ENV})`);
});

export { app };
