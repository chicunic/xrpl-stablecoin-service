import assert from "node:assert/strict";

/** A fetch `Response` reduced to the fields tests assert on, with the body pre-parsed. */
export interface TestResponse {
  status: number;
  body: unknown;
  headers: Headers;
}

export const restAssert = {
  expectSuccess(response: TestResponse, expectedStatus = 200) {
    assert.equal(
      response.status,
      expectedStatus,
      `Expected status ${String(expectedStatus)}, got ${String(response.status)}`,
    );
    assert.notEqual(response.body, undefined, "Expected response body to be defined");
  },

  expectError(response: TestResponse, expectedStatus: number, expectedMessage?: string) {
    assert.equal(
      response.status,
      expectedStatus,
      `Expected status ${String(expectedStatus)}, got ${String(response.status)}`,
    );
    // RFC 9457 Problem Details: the human-readable message lives in `detail` (with `title` as fallback).
    const body = response.body as { detail?: string; title?: string };
    const message = body.detail ?? body.title;
    assert.ok(message, "Expected problem detail/title to be defined");
    if (expectedMessage) {
      assert.ok(
        message.includes(expectedMessage),
        `Expected problem message to contain "${expectedMessage}", got "${message}"`,
      );
    }
  },
};
