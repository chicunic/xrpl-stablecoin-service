import type { Response } from "supertest";

export const restAssert = {
  expectSuccess(response: Response, expectedStatus = 200) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toBeDefined();
  },

  expectError(response: Response, expectedStatus: number, expectedMessage?: string) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body.error).toBeDefined();
    if (expectedMessage) {
      expect(response.body.error).toContain(expectedMessage);
    }
  },
};
