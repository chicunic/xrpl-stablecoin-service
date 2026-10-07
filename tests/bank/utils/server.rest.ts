import app from "../../../src/bank/app";
import type { TestResponse } from "../../utils/helpers";

/**
 * Drives the Hono bank app via `app.request()` (no network). Mirrors the old
 * supertest-based helper surface so route tests need no changes.
 */
async function send(
  requestApp: typeof app,
  method: string,
  url: string,
  data?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<TestResponse> {
  const init: RequestInit = { method };
  const hdrs = new Headers(headers);
  if (data !== undefined) {
    hdrs.set("content-type", "application/json");
    init.body = JSON.stringify(data);
  }
  init.headers = hdrs;

  const res = await requestApp.request(url, init);

  let body: unknown = undefined;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body, headers: res.headers };
}

export class BankRestTestHelper {
  constructor(private readonly requestApp: typeof app = app) {}

  async post(url: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<TestResponse> {
    return send(this.requestApp, "POST", url, data, headers);
  }

  async get(url: string, headers?: Record<string, string>): Promise<TestResponse> {
    return send(this.requestApp, "GET", url, undefined, headers);
  }

  async patch(url: string, data: Record<string, unknown>, headers?: Record<string, string>): Promise<TestResponse> {
    return send(this.requestApp, "PATCH", url, data, headers);
  }
}

/** Kept for API compatibility; the Hono app is imported directly. */
export function createBankTestApp(): Promise<typeof app> {
  return Promise.resolve(app);
}
