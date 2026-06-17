import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { mockIdentityPlatformAuth } from "../utils/mock.index";

const mockVerifyMfaToken = vi.hoisted(() => vi.fn());
vi.mock("../../src/token/services/mfa-token.service", () => ({
  verifyMfaToken: mockVerifyMfaToken,
}));

import {
  type AuthEnv,
  type AuthUser,
  requireAuth,
  requireKyc,
  requireMfa,
  requireOperationMfa,
} from "../../src/token/middleware/auth";

const BASE_USER: AuthUser = {
  uid: "google-uid-123456",
  email: "test@example.com",
  name: "Test User",
  mfaVerified: true,
  kycStatus: "approved",
  authTime: 0,
};

/** Build a Hono app that runs `mw`, optionally seeding `user`, and echoes the resulting user. */
function appWith(mw: MiddlewareHandler<AuthEnv>, seedUser?: AuthUser) {
  const app = new Hono<AuthEnv>();
  if (seedUser) {
    app.use("*", async (c, next) => {
      c.set("user", seedUser);
      await next();
    });
  }
  app.use("*", mw);
  app.get("/", (c) => c.json({ ok: true, user: c.get("user") }));
  return app;
}

describe("requireAuth middleware", () => {
  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();
  });

  afterEach(() => {
    mockIdentityPlatformAuth.reset();
  });

  it("should return 401 if no Authorization header", async () => {
    const res = await appWith(requireAuth).request("/");
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Missing session token");
  });

  it("should return 401 if session token is invalid", async () => {
    mockIdentityPlatformAuth.verifySessionCookie.mockRejectedValue(new Error("Error expected in test: invalid"));
    const res = await appWith(requireAuth).request("/", { headers: { authorization: "Bearer invalid-session" } });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid or expired session");
  });

  it("should return 401 if email is not verified", async () => {
    mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      email_verified: false,
    });
    const res = await appWith(requireAuth).request("/", { headers: { authorization: "Bearer valid-session" } });
    expect(res.status).toBe(401);
  });

  it("should call next and set user on valid session with MFA and KYC", async () => {
    const res = await appWith(requireAuth).request("/", { headers: { authorization: "Bearer valid-session" } });
    expect(res.status).toBe(200);
    const user = ((await res.json()) as { user: AuthUser }).user;
    expect(user.uid).toBe("google-uid-123456");
    expect(user.email).toBe("test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.mfaVerified).toBe(true);
    expect(user.kycStatus).toBe("approved");
  });

  it("should set mfaVerified to false and kycStatus to none when not in token", async () => {
    mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
      auth_time: 0,
      firebase: {},
    });
    const res = await appWith(requireAuth).request("/", { headers: { authorization: "Bearer valid-session" } });
    const user = ((await res.json()) as { user: AuthUser }).user;
    expect(user.mfaVerified).toBe(false);
    expect(user.kycStatus).toBe("none");
    expect(user.authTime).toBe(0);
  });

  it("should set authTime from decoded token", async () => {
    const authTime = Math.floor(Date.now() / 1000);
    mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
      auth_time: authTime,
      firebase: { sign_in_second_factor: "phone" },
      kycStatus: "approved",
    });
    const res = await appWith(requireAuth).request("/", { headers: { authorization: "Bearer valid-session" } });
    const user = ((await res.json()) as { user: AuthUser }).user;
    expect(user.authTime).toBe(authTime);
  });
});

describe("requireMfa middleware", () => {
  it("should return 403 if MFA not verified", async () => {
    const res = await appWith(requireMfa, { ...BASE_USER, mfaVerified: false, kycStatus: "none" }).request("/");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("MFA required");
  });

  it("should call next if MFA verified", async () => {
    const res = await appWith(requireMfa, { ...BASE_USER, mfaVerified: true }).request("/");
    expect(res.status).toBe(200);
  });
});

describe("requireKyc middleware", () => {
  it("should return 403 if KYC not approved", async () => {
    const res = await appWith(requireKyc, { ...BASE_USER, kycStatus: "none" }).request("/");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("KYC required");
  });

  it("should call next if KYC approved", async () => {
    const res = await appWith(requireKyc, { ...BASE_USER, kycStatus: "approved" }).request("/");
    expect(res.status).toBe(200);
  });
});

describe("requireOperationMfa middleware", () => {
  beforeEach(() => {
    mockVerifyMfaToken.mockReset();
  });

  it("should return 403 if no X-MFA-Token header", async () => {
    const res = await appWith(requireOperationMfa, { ...BASE_USER }).request("/");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("MFA verification required");
  });

  it("should return 403 if token verification fails", async () => {
    mockVerifyMfaToken.mockImplementation(() => {
      throw new Error("Invalid MFA token");
    });
    const res = await appWith(requireOperationMfa, { ...BASE_USER }).request("/", {
      headers: { "x-mfa-token": "invalid-token" },
    });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("MFA verification required");
  });

  it("should call next on valid token", async () => {
    mockVerifyMfaToken.mockReturnValue(undefined);
    const res = await appWith(requireOperationMfa, { ...BASE_USER }).request("/", {
      headers: { "x-mfa-token": "valid-mfa-token" },
    });
    expect(res.status).toBe(200);
    expect(mockVerifyMfaToken).toHaveBeenCalledWith("valid-mfa-token", "google-uid-123456");
  });
});
