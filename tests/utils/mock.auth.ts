const mockVerifyIdToken = jest.fn();
const mockVerifySessionCookie = jest.fn();
const mockCreateSessionCookie = jest.fn();
const mockSetCustomUserClaims = jest.fn();

jest.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
    verifySessionCookie: mockVerifySessionCookie,
    createSessionCookie: mockCreateSessionCookie,
    setCustomUserClaims: mockSetCustomUserClaims,
  }),
}));

export const mockIdentityPlatformAuth = {
  verifyIdToken: mockVerifyIdToken,
  verifySessionCookie: mockVerifySessionCookie,
  createSessionCookie: mockCreateSessionCookie,
  setCustomUserClaims: mockSetCustomUserClaims,
  setupWithoutMfa: () => {
    const claims = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
    };
    mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue(claims);
    mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue(claims);
    mockIdentityPlatformAuth.createSessionCookie.mockResolvedValue("mock-session-cookie");
    mockIdentityPlatformAuth.setCustomUserClaims.mockResolvedValue(undefined);
  },
  setup: () => {
    const claims = {
      uid: "google-uid-123456",
      email: "test@example.com",
      name: "Test User",
      email_verified: true,
      firebase: { sign_in_second_factor: "phone" },
      kycStatus: "approved",
    };
    mockIdentityPlatformAuth.verifyIdToken.mockResolvedValue(claims);
    mockIdentityPlatformAuth.verifySessionCookie.mockResolvedValue(claims);
    mockIdentityPlatformAuth.createSessionCookie.mockResolvedValue("mock-session-cookie");
    mockIdentityPlatformAuth.setCustomUserClaims.mockResolvedValue(undefined);
  },
  reset: () => {
    mockIdentityPlatformAuth.verifyIdToken.mockReset();
    mockIdentityPlatformAuth.verifySessionCookie.mockReset();
    mockIdentityPlatformAuth.createSessionCookie.mockReset();
    mockIdentityPlatformAuth.setCustomUserClaims.mockReset();
  },
};
