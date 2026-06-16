import path from "node:path";
import express from "express";
import * as OpenApiValidator from "express-openapi-validator";
import request, { type Response } from "supertest";

function createBankTestAppWithValidation(): express.Application {
  const app = express();
  app.use(express.json());

  app.use(
    OpenApiValidator.middleware({
      apiSpec: path.join(__dirname, "../../../src/bank/swagger.json"),
      validateRequests: true,
      validateResponses: false,
    }),
  );

  return app;
}

interface HttpError {
  status?: number;
  message?: string;
  errors?: unknown;
}

function addErrorHandlingToTestApp(app: express.Application): void {
  app.use((err: HttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

export async function createBankTestApp(): Promise<express.Application> {
  const app = createBankTestAppWithValidation();

  const accountRoutes = (await import("../../../src/bank/routes/account.route")).default;
  const atmRoutes = (await import("../../../src/bank/routes/atm.route")).default;
  const transferRoutes = (await import("../../../src/bank/routes/transfer.route")).default;
  const transactionRoutes = (await import("../../../src/bank/routes/transaction.route")).default;
  const virtualAccountRoutes = (await import("../../../src/bank/routes/virtual-account.route")).default;

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/v1", accountRoutes);
  app.use("/api/v1", atmRoutes);
  app.use("/api/v1", transferRoutes);
  app.use("/api/v1", transactionRoutes);
  app.use("/api/v1", virtualAccountRoutes);

  addErrorHandlingToTestApp(app);

  return app;
}

export class BankRestTestHelper {
  constructor(private app: express.Application) {}

  get request() {
    return request(this.app);
  }

  async post(url: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<Response> {
    const req = this.request.post(url).send(data);
    if (headers) {
      for (const [key, value] of Object.entries(headers)) req.set(key, value);
    }
    return req;
  }

  async get(url: string, headers?: Record<string, string>) {
    const req = this.request.get(url);
    if (headers) {
      for (const [key, value] of Object.entries(headers)) req.set(key, value);
    }
    return req;
  }

  async patch(url: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<Response> {
    const req = this.request.patch(url).send(data);
    if (headers) {
      for (const [key, value] of Object.entries(headers)) req.set(key, value);
    }
    return req;
  }
}
