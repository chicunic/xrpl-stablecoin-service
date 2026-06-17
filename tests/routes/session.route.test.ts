import { restAssert } from "../utils/helpers";
import { mockIdentityPlatformAuth } from "../utils/mock.index";
import { RestTestHelper, createCompleteTestApp } from "../utils/server.rest";

describe("Session Routes - REST API boundaries", () => {
  let app: Awaited<ReturnType<typeof createCompleteTestApp>>;
  let helper: RestTestHelper;

  beforeAll(async () => {
    app = await createCompleteTestApp();
    helper = new RestTestHelper(app);
  });

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
  });

  describe("POST /api/v1/session/login", () => {
    it("returns 400 for a missing idToken", async () => {
      const response = await helper.post("/api/v1/session/login", {});
      restAssert.expectError(response, 400);
    });

    it("returns 401 when the sign-in is not recent", async () => {
      // auth_time well in the past → beyond the 5-minute recency window.
      mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue({ auth_time: 0 });

      const response = await helper.post("/api/v1/session/login", { idToken: "id-token" });

      restAssert.expectError(response, 401, "Recent sign-in required");
    });

    it("returns 200 and a session token for a recent sign-in", async () => {
      const recentAuthTime = Math.floor(Date.now() / 1000) - 10;
      mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue({ auth_time: recentAuthTime });
      mockIdentityPlatformAuth.createSessionCookie.mockResolvedValue("session-cookie-value");

      const response = await helper.post("/api/v1/session/login", { idToken: "id-token" });

      restAssert.expectSuccess(response, 200);
      const body = response.body as { status: string; sessionToken: string };
      expect(body.status).toBe("ok");
      expect(body.sessionToken).toBe("session-cookie-value");
    });
  });

  describe("POST /api/v1/session/refresh", () => {
    it("returns 400 for a missing idToken", async () => {
      const response = await helper.post("/api/v1/session/refresh", {}, { Authorization: "Bearer existing-session" });
      restAssert.expectError(response, 400);
    });

    it("returns 401 when no existing session is provided", async () => {
      const response = await helper.post("/api/v1/session/refresh", { idToken: "id-token" });
      restAssert.expectError(response, 401, "No existing session");
    });

    it("returns 200 and a new session token when the existing session is valid", async () => {
      mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue({ uid: "google-uid-123456" });
      mockIdentityPlatformAuth.createSessionCookie.mockResolvedValue("new-session-cookie");

      const response = await helper.post(
        "/api/v1/session/refresh",
        { idToken: "id-token" },
        { Authorization: "Bearer existing-session" },
      );

      restAssert.expectSuccess(response, 200);
      expect((response.body as { sessionToken: string }).sessionToken).toBe("new-session-cookie");
    });
  });

  describe("POST /api/v1/session/logout", () => {
    it("returns 200 (client-side session clear, no auth required)", async () => {
      const response = await helper.post("/api/v1/session/logout", {});

      restAssert.expectSuccess(response, 200);
      expect((response.body as { status: string }).status).toBe("ok");
    });
  });
});
