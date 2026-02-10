import path from "node:path";
import express from "express";
import * as OpenApiValidator from "express-openapi-validator";
import request, { type Response } from "supertest";

function createTestAppWithValidation(): express.Application {
  const app = express();
  app.use(express.json());

  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(__dirname, "../../src/token/swagger.json"),
      validateRequests: true,
      validateResponses: false,
    }),
  );

  return app;
}

function addErrorHandlingToTestApp(app: express.Application): void {
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.status && err.status < 500) {
      res.status(err.status).json({
        error: err.message,
        details: err.errors,
      });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  });
}

export async function createCompleteTestApp(): Promise<express.Application> {
  const app = createTestAppWithValidation();

  const authRoutes = (await import("../../src/token/routes/auth.route")).default;
  const kycRoutes = (await import("../../src/token/routes/kyc.route")).default;
  const mfaRoutes = (await import("../../src/token/routes/mfa.route")).default;
  const tokenRoutes = (await import("../../src/token/routes/token.route")).default;
  const pubsubRoutes = (await import("../../src/token/routes/pubsub.route")).default;
  const eventarcRoutes = (await import("../../src/token/routes/eventarc.route")).default;
  const balanceRoutes = (await import("../../src/token/routes/balance.route")).default;
  const whitelistRoutes = (await import("../../src/token/routes/whitelist.route")).default;

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/v1", authRoutes);
  app.use("/api/v1", kycRoutes);
  app.use("/api/v1", mfaRoutes);
  app.use("/api/v1", tokenRoutes);
  app.use("/api/v1", pubsubRoutes);
  app.use("/api/v1", eventarcRoutes);
  app.use("/api/v1", balanceRoutes);
  app.use("/api/v1", whitelistRoutes);

  addErrorHandlingToTestApp(app);

  return app;
}

export class RestTestHelper {
  constructor(private app: express.Application) {}

  get request() {
    return request(this.app);
  }

  private applyHeaders(req: request.Test, headers?: Record<string, string>): request.Test {
    if (headers) {
      for (const [key, value] of Object.entries(headers)) req.set(key, value);
    }
    return req;
  }

  async post<TResponse = any>(
    url: string,
    data: any,
    headers?: Record<string, string>,
  ): Promise<Response & { body: TResponse }> {
    const req = this.request.post(url).send(data);
    return this.applyHeaders(req, headers) as Promise<Response & { body: TResponse }>;
  }

  async get(url: string, headers?: Record<string, string>) {
    const req = this.request.get(url);
    return this.applyHeaders(req, headers);
  }

  async delete(url: string, headers?: Record<string, string>) {
    const req = this.request.delete(url);
    return this.applyHeaders(req, headers);
  }

  async patch<TResponse = any>(
    url: string,
    data: any,
    headers?: Record<string, string>,
  ): Promise<Response & { body: TResponse }> {
    const req = this.request.patch(url).send(data);
    return this.applyHeaders(req, headers) as Promise<Response & { body: TResponse }>;
  }
}
