process.env.MFA_TOKEN_SECRET = "test-mfa-secret-key-for-testing";

import { generateMfaToken, verifyMfaToken } from "../../src/token/services/mfa-token.service";

describe("mfa-token.service", () => {
  const testUid = "test-uid-123";

  describe("generateMfaToken", () => {
    it("should generate a valid token string with 3 parts", () => {
      const token = generateMfaToken(testUid);
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
    });

    it("should include uid and exp in payload", () => {
      const token = generateMfaToken(testUid);
      const payloadPart = token.split(".")[1] ?? "";
      const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as {
        uid: string;
        exp: number;
        iat: number;
      };
      expect(payload.uid).toBe(testUid);
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp - payload.iat).toBe(300);
    });
  });

  describe("verifyMfaToken", () => {
    it("should verify a valid token", () => {
      const token = generateMfaToken(testUid);
      expect(() => {
        verifyMfaToken(token, testUid);
      }).not.toThrow();
    });

    it("should reject token with wrong uid", () => {
      const token = generateMfaToken(testUid);
      expect(() => {
        verifyMfaToken(token, "wrong-uid");
      }).toThrow("MFA token uid mismatch");
    });

    it("should reject token with invalid format", () => {
      expect(() => {
        verifyMfaToken("invalid-token", testUid);
      }).toThrow("Invalid MFA token format");
    });

    it("should reject token with tampered signature", () => {
      const token = generateMfaToken(testUid);
      const parts = token.split(".");
      const tamperedToken = `${parts[0] ?? ""}.${parts[1] ?? ""}.tampered-signature`;
      expect(() => {
        verifyMfaToken(tamperedToken, testUid);
      }).toThrow("Invalid MFA token signature");
    });

    it("should reject expired token", () => {
      const originalDateNow = Date.now;
      const pastTime = Date.now() - 400 * 1000; // 400 seconds ago
      Date.now = vi.fn().mockReturnValue(pastTime);
      const token = generateMfaToken(testUid);
      Date.now = originalDateNow;

      expect(() => {
        verifyMfaToken(token, testUid);
      }).toThrow("MFA token expired");
    });
  });
});
