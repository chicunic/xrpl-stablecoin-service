import type { NextFunction, Request, Response } from "express";
import { type AuthenticatedRequest, requireAuth } from "../../src/token/middleware/auth";
import { mockGoogleAuth } from "../utils/mock.index";

describe("requireAuth middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockGoogleAuth.reset();
    mockGoogleAuth.setup();

    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any,
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    mockGoogleAuth.reset();
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
    mockGoogleAuth.verifyIdToken.mockRejectedValue(new Error("Error expected in test: invalid"));

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 401 if email is not verified", async () => {
    mockReq.headers = { authorization: "Bearer valid-token" };
    mockGoogleAuth.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-uid-123456",
        email: "test@example.com",
        email_verified: false,
      }),
    });

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should call next and set user on valid token", async () => {
    mockReq.headers = { authorization: "Bearer valid-token" };

    await requireAuth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    const authReq = mockReq as unknown as AuthenticatedRequest;
    expect(authReq.user.uid).toBe("google-uid-123456");
    expect(authReq.user.email).toBe("test@example.com");
    expect(authReq.user.name).toBe("Test User");
  });
});
