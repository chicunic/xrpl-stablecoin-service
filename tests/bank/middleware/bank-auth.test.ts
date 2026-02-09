import type { NextFunction, Request, Response } from "express";
import {
  generateApiToken,
  generateToken,
  rejectApiToken,
  requireBankAuth,
  verifyToken,
} from "../../../src/bank/middleware/bank-auth";

// Set environment variable before tests
process.env.BANK_JWT_SECRET = "test-secret-for-bank-auth-tests";

describe("Bank Auth Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      headers: {},
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = jest.fn();
  });

  describe("generateToken / verifyToken", () => {
    it("should generate and verify a valid token", () => {
      const token = generateToken("test-account-id");
      const decoded = verifyToken(token);

      expect(decoded.accountId).toBe("test-account-id");
      expect(decoded.tokenType).toBe("session");
    });

    it("should throw for invalid token format", () => {
      expect(() => verifyToken("invalid")).toThrow("Invalid token format");
    });

    it("should throw for tampered token", () => {
      const token = generateToken("test-account-id");
      const parts = token.split(".");
      const tampered = `${parts[0]}.${parts[1]}.tampered-signature`;

      expect(() => verifyToken(tampered)).toThrow();
    });
  });

  describe("generateApiToken / verifyToken", () => {
    it("should generate and verify a long-lived API token (no exp)", () => {
      const token = generateApiToken("test-account-id");
      const decoded = verifyToken(token);

      expect(decoded.accountId).toBe("test-account-id");
      expect(decoded.tokenType).toBe("api");
    });

    it("should not expire", () => {
      const token = generateApiToken("test-account-id");
      expect(() => verifyToken(token)).not.toThrow();
    });
  });

  describe("requireBankAuth", () => {
    it("should return 401 without authorization header", async () => {
      await requireBankAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: "Missing or invalid Authorization header" });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 with non-Bearer token", async () => {
      mockReq.headers = { authorization: "Basic some-token" };

      await requireBankAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 with invalid token", async () => {
      mockReq.headers = { authorization: "Bearer invalid-token" };

      await requireBankAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: "Invalid or expired token" });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should set tokenType to session for regular token", async () => {
      const token = generateToken("test-account-id");
      mockReq.headers = { authorization: `Bearer ${token}` };

      await requireBankAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).bankUser.accountId).toBe("test-account-id");
      expect((mockReq as any).bankUser.tokenType).toBe("session");
    });

    it("should set tokenType to api for API token", async () => {
      const apiToken = generateApiToken("api-account-id");
      mockReq.headers = { authorization: `Bearer ${apiToken}` };

      await requireBankAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).bankUser.accountId).toBe("api-account-id");
      expect((mockReq as any).bankUser.tokenType).toBe("api");
    });

    it("should fallback to cookie __session when no Authorization header", async () => {
      const token = generateToken("test-account-id");
      mockReq.cookies = { __session: token };

      await requireBankAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).bankUser.accountId).toBe("test-account-id");
    });

    it("should prefer Bearer header over cookie", async () => {
      const bearerToken = generateToken("bearer-account");
      const cookieToken = generateToken("cookie-account");
      mockReq.headers = { authorization: `Bearer ${bearerToken}` };
      mockReq.cookies = { __session: cookieToken };

      await requireBankAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).bankUser.accountId).toBe("bearer-account");
    });
  });

  describe("rejectApiToken", () => {
    it("should call next for session token", async () => {
      (mockReq as any).bankUser = { accountId: "test", tokenType: "session" };

      await rejectApiToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should return 403 for API token", async () => {
      (mockReq as any).bankUser = { accountId: "test", tokenType: "api" };

      await rejectApiToken(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({ error: "API tokens are not allowed for this endpoint" });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
