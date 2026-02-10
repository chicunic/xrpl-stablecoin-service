process.env.MFA_TOKEN_SECRET_PATH = "projects/test/secrets/mfa-secret/versions/latest";

jest.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: jest.fn().mockResolvedValue([{ payload: { data: "test-mfa-secret-key-for-testing" } }]),
  })),
}));

import { generateMfaToken, verifyMfaToken } from "../../src/token/services/mfa-token.service";

describe("mfa-token.service", () => {
  const testUid = "test-uid-123";

  describe("generateMfaToken", () => {
    it("should generate a valid token string with 3 parts", async () => {
      const token = await generateMfaToken(testUid);
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
    });

    it("should include uid and exp in payload", async () => {
      const token = await generateMfaToken(testUid);
      const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
      expect(payload.uid).toBe(testUid);
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
      expect(payload.exp - payload.iat).toBe(300);
    });
  });

  describe("verifyMfaToken", () => {
    it("should verify a valid token", async () => {
      const token = await generateMfaToken(testUid);
      await expect(verifyMfaToken(token, testUid)).resolves.toBeUndefined();
    });

    it("should reject token with wrong uid", async () => {
      const token = await generateMfaToken(testUid);
      await expect(verifyMfaToken(token, "wrong-uid")).rejects.toThrow("MFA token uid mismatch");
    });

    it("should reject token with invalid format", async () => {
      await expect(verifyMfaToken("invalid-token", testUid)).rejects.toThrow("Invalid MFA token format");
    });

    it("should reject token with tampered signature", async () => {
      const token = await generateMfaToken(testUid);
      const parts = token.split(".");
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered-signature`;
      await expect(verifyMfaToken(tamperedToken, testUid)).rejects.toThrow("Invalid MFA token signature");
    });

    it("should reject expired token", async () => {
      const originalDateNow = Date.now;
      const pastTime = Date.now() - 400 * 1000; // 400 seconds ago
      Date.now = jest.fn().mockReturnValue(pastTime);
      const token = await generateMfaToken(testUid);
      Date.now = originalDateNow;

      await expect(verifyMfaToken(token, testUid)).rejects.toThrow("MFA token expired");
    });
  });
});
