import type express from "express";
import { restAssert } from "./utils/helpers";
import { mockFirestoreService, mockIdentityPlatformAuth } from "./utils/mock.index";
import { createCompleteTestApp, RestTestHelper } from "./utils/server.rest";

// Mock bank config to avoid real Secret Manager calls
jest.mock("../src/token/config/bank", () => ({
  getBankServiceUrl: jest.fn().mockReturnValue("http://mock-bank-service"),
  getBankAuthToken: jest.fn().mockResolvedValue("mock-bank-auth-token"),
}));

describe("Health Check - REST API", () => {
  let app: express.Application;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockFirestoreService.reset();
    mockFirestoreService.setup();
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
  });

  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await helper.get("/health");

      restAssert.expectSuccess(response);
      expect(response.body.status).toBe("ok");
      expect(response.body.timestamp).toBeDefined();
    });
  });
});
