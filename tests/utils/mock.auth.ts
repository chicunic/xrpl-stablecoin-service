const mockVerifyIdToken = jest.fn();
const mockSetCustomUserClaims = jest.fn();

process.env.IDENTITY_PLATFORM_TENANT_ID = "test-tenant-id";

jest.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    tenantManager: () => ({
      authForTenant: () => ({
        verifyIdToken: mockVerifyIdToken,
        setCustomUserClaims: mockSetCustomUserClaims,
      }),
    }),
  }),
}));

export const mockIdentityPlatformAuth = {
  verifyIdToken: mockVerifyIdToken,
  setCustomUserClaims: mockSetCustomUserClaims,
  setupWithoutMfa: () => {
    mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
    });
    mockIdentityPlatformAuth.setCustomUserClaims.mockResolvedValue(undefined);
  },
  setup: () => {
    mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue({
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
      firebase: { sign_in_second_factor: "phone" },
      kycStatus: "approved",
    });
    mockIdentityPlatformAuth.setCustomUserClaims.mockResolvedValue(undefined);
  },
  reset: () => {
    mockIdentityPlatformAuth.verifyIdToken.mockReset();
    mockIdentityPlatformAuth.setCustomUserClaims.mockReset();
  },
};
