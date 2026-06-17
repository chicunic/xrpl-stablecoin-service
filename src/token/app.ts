import { setupAppBaseline } from "@common/utils/app-setup.js";
import { defaultHook } from "@common/utils/problem.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import authRoutes from "@token/routes/auth.route.js";
import balanceRoutes from "@token/routes/balance.route.js";
import credentialRoutes from "@token/routes/credential.route.js";
import eventarcRoutes from "@token/routes/eventarc.route.js";
import exchangeRoutes from "@token/routes/exchange.route.js";
import invoiceRoutes from "@token/routes/invoice.route.js";
import kycRoutes from "@token/routes/kyc.route.js";
import mfaRoutes from "@token/routes/mfa.route.js";
import pubsubRoutes from "@token/routes/pubsub.route.js";
import sessionRoutes from "@token/routes/session.route.js";
import tokenRoutes from "@token/routes/token.route.js";
import whitelistRoutes from "@token/routes/whitelist.route.js";
import withdrawalRoutes from "@token/routes/withdrawal.route.js";

// firebase/pubsub initialization happens in the server entrypoint (index.ts), so tests can import this app without triggering real initialization.
const app = new OpenAPIHono({ defaultHook: defaultHook() });

const allowedOrigins = [
  process.env.CORS_ORIGIN ?? "http://localhost:5173",
  "https://xrpl-token.web.app",
  "https://xrpl-token.firebaseapp.com",
];

setupAppBaseline(app, allowedOrigins);

app.route("/api/v1", sessionRoutes);
app.route("/api/v1", authRoutes);
app.route("/api/v1", kycRoutes);
app.route("/api/v1", mfaRoutes);
app.route("/api/v1", tokenRoutes);
app.route("/api/v1", pubsubRoutes);
app.route("/api/v1", eventarcRoutes);
app.route("/api/v1", balanceRoutes);
app.route("/api/v1", credentialRoutes);
app.route("/api/v1", exchangeRoutes);
app.route("/api/v1", invoiceRoutes);
app.route("/api/v1", whitelistRoutes);
app.route("/api/v1", withdrawalRoutes);

app.openAPIRegistry.registerComponent("securitySchemes", "session", {
  type: "http",
  scheme: "bearer",
  description: "Firebase session cookie as a Bearer token",
});

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "XRPL Stablecoin Token Service",
    version: "0.1.0",
    description: "XRPL stablecoin issuance API. Errors follow RFC 9457 (Problem Details).",
  },
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

export default app;
