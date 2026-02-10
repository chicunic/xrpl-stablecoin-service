import type { NextFunction, Request, Response } from "express";
import { mockIdentityPlatformAuth } from "../utils/mock.index";

const mockVerifyMfaToken = jest.fn();
jest.mock("../../src/token/services/mfa-token.service", () => ({
  verifyMfaToken: mockVerifyMfaToken,
}));

import {
  type AuthenticatedRequest,
  requireAuth,
  requireKyc,
  requireMfa,
  requireOperationMfa,
} from "../../src/token/middleware/auth";

describe("requireAuth middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockIdentityPlatformAuth.reset();
    mockIdentityPlatformAuth.setup();

    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    mockIdentityPlatformAuth.reset();
  });

  it("should return 401 if no Authorization header", async () => {
    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Missing or invalid Authorization header" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 401 if Authorization header is not Bearer", async () => {
    mockReq.headers = { authorization: "Basic token123" };

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 401 if token is invalid", async () => {
    mockReq.headers = { authorization: "Bearer invalid-token" };
    mockIdentityPlatformAuth.verifyIdToken.mockRejectedValue(new Error("Error expected in test: invalid"));

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 401 if email is not verified", async () => {
    mockReq.headers = { authorization: "Bearer valid-token" };
    mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      email_verified: false,
    });

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should call next and set user on valid token with MFA and KYC", async () => {
    mockReq.headers = { authorization: "Bearer valid-token" };

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    const authReq = mockReq as unknown as AuthenticatedRequest;
    expect(authReq.user.uid).toBe("google-uid-123456");
    expect(authReq.user.email).toBe("test@example.com");
    expect(authReq.user.name).toBe("Test User");
    expect(authReq.user.mfaVerified).toBe(true);
    expect(authReq.user.kycStatus).toBe("approved");
  });

  it("should set mfaVerified to false and kycStatus to none when not in token", async () => {
    mockReq.headers = { authorization: "Bearer valid-token" };
    mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
    });

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    const authReq = mockReq as unknown as AuthenticatedRequest;
    expect(authReq.user.mfaVerified).toBe(false);
    expect(authReq.user.kycStatus).toBe("none");
    expect(authReq.user.authTime).toBe(0);
  });

  it("should set authTime from decoded token", async () => {
    mockReq.headers = { authorization: "Bearer valid-token" };
    const authTime = Math.floor(Date.now() / 1000);
    mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
      auth_time: authTime,
      firebase: { sign_in_second_factor: "phone" },
      kycStatus: "approved",
    });

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    const authReq = mockReq as unknown as AuthenticatedRequest;
    expect(authReq.user.authTime).toBe(authTime);
  });
});

describe("requireMfa middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
    };
    mockNext = jest.fn();
  });

  it("should return 403 if MFA not verified", () => {
    (mockReq as AuthenticatedRequest).user = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      mfaVerified: false,
    } as any;

    requireMfa(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "MFA required" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should call next if MFA verified", () => {
    (mockReq as AuthenticatedRequest).user = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      mfaVerified: true,
    } as any;

    requireMfa(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe("requireKyc middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
    };
    mockNext = jest.fn();
  });

  it("should return 403 if KYC not approved", () => {
    (mockReq as AuthenticatedRequest).user = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      mfaVerified: true,
      kycStatus: "none",
      authTime: Math.floor(Date.now() / 1000),
    };

    requireKyc(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "KYC required" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should call next if KYC approved", () => {
    (mockReq as AuthenticatedRequest).user = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      mfaVerified: true,
      kycStatus: "approved",
    } as any;

    requireKyc(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

describe("requireOperationMfa middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockVerifyMfaToken.mockReset();
    mockReq = {
      headers: {},
      cookies: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
      clearCookie: jest.fn() as any,
    };
    mockNext = jest.fn();
  });

  it("should return 403 if no __mfa_token cookie", async () => {
    (mockReq as AuthenticatedRequest).user = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      mfaVerified: true,
      kycStatus: "approved",
      authTime: Math.floor(Date.now() / 1000),
    };

    await requireOperationMfa(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "MFA verification required", code: "MFA_REQUIRED" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 403 if token verification fails", async () => {
    (mockReq as AuthenticatedRequest).user = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      mfaVerified: true,
      kycStatus: "approved",
      authTime: Math.floor(Date.now() / 1000),
    };
    (mockReq as any).cookies = { __mfa_token: "invalid-token" };
    mockVerifyMfaToken.mockRejectedValue(new Error("Invalid MFA token"));

    await requireOperationMfa(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "MFA verification required", code: "MFA_REQUIRED" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should call next and clear cookie on valid token", async () => {
    (mockReq as AuthenticatedRequest).user = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      mfaVerified: true,
      kycStatus: "approved",
      authTime: Math.floor(Date.now() / 1000),
    };
    (mockReq as any).cookies = { __mfa_token: "valid-mfa-token" };
    mockVerifyMfaToken.mockResolvedValue(undefined);

    await requireOperationMfa(mockReq as Request, mockRes as Response, mockNext);

    expect(mockVerifyMfaToken).toHaveBeenCalledWith("valid-mfa-token", "google-uid-123456");
    expect(mockRes.clearCookie).toHaveBeenCalledWith("__mfa_token", { path: "/api/v1" });
    expect(mockNext).toHaveBeenCalled();
  });
});
