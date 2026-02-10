import path from "node:path";
import accountRoutes from "@bank/routes/account.route.js";
import atmRoutes from "@bank/routes/atm.route.js";
import transactionRoutes from "@bank/routes/transaction.route.js";
import transferRoutes from "@bank/routes/transfer.route.js";
import virtualAccountRoutes from "@bank/routes/virtual-account.route.js";
import { initializeFirebase } from "@common/config/firebase.js";
import { initializePubSub } from "@common/config/pubsub.js";
import { firestoreTimestampReplacer } from "@common/utils/json.replacer.js";

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
initializePubSub();

const app: Express = express();
const port = process.env.PORT ?? 8080;

app.set("json replacer", firestoreTimestampReplacer);
app.use(helmet());
const allowedOrigins = [
  process.env.CORS_ORIGIN ?? "http://localhost:5174",
  "https://xrpl-bank.web.app",
  "https://xrpl-bank.firebaseapp.com",
];
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

app.use("/api/v1", accountRoutes);
app.use("/api/v1", atmRoutes);
app.use("/api/v1", transferRoutes);
app.use("/api/v1", transactionRoutes);
app.use("/api/v1", virtualAccountRoutes);

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
  console.log(`Bank server running on port ${port} (${process.env.NODE_ENV})`);
});

export { app };
