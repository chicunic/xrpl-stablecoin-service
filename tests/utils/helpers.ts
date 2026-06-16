import assert from "node:assert/strict";
import type { Response } from "supertest";

export const restAssert = {
  expectSuccess(response: Response, expectedStatus = 200) {
    assert.equal(
      response.status,
      expectedStatus,
      `Expected status ${String(expectedStatus)}, got ${String(response.status)}`,
    );
    assert.notEqual(response.body, undefined, "Expected response body to be defined");
  },

  expectError(response: Response, expectedStatus: number, expectedMessage?: string) {
    assert.equal(
      response.status,
      expectedStatus,
      `Expected status ${String(expectedStatus)}, got ${String(response.status)}`,
    );
    const body = response.body as { error?: string };
    assert.ok(body.error, "Expected error field to be defined");
    if (expectedMessage) {
      assert.ok(
        body.error.includes(expectedMessage),
        `Expected error to contain "${expectedMessage}", got "${body.error}"`,
      );
    }
  },
};
