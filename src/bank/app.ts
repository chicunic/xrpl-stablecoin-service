import accountRoutes from "@bank/routes/account.route.js";
import atmRoutes from "@bank/routes/atm.route.js";
import transactionRoutes from "@bank/routes/transaction.route.js";
import transferRoutes from "@bank/routes/transfer.route.js";
import virtualAccountRoutes from "@bank/routes/virtual-account.route.js";
import { setupAppBaseline } from "@common/utils/app-setup.js";
import { defaultHook } from "@common/utils/problem.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";

const app = new OpenAPIHono({ defaultHook: defaultHook() });

const allowedOrigins = [
  process.env.CORS_ORIGIN ?? "http://localhost:5174",
  "https://xrpl-bank.web.app",
  "https://xrpl-bank.firebaseapp.com",
];

setupAppBaseline(app, allowedOrigins);

app.route("/api/v1", accountRoutes);
app.route("/api/v1", atmRoutes);
app.route("/api/v1", transferRoutes);
app.route("/api/v1", transactionRoutes);
app.route("/api/v1", virtualAccountRoutes);

app.openAPIRegistry.registerComponent("securitySchemes", "bearer", {
  type: "http",
  scheme: "bearer",
  description: "Bank HMAC JWT as a Bearer token",
});

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "XRPL Stablecoin Bank Service",
    version: "0.1.0",
    description: "Mock bank API for the XRPL stablecoin platform. Errors follow RFC 9457 (Problem Details).",
  },
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

export default app;
