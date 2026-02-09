import { OAuth2Client } from "google-auth-library";

export const mockGoogleAuth = {
  verifyIdToken: jest.fn(),
  spy: null as jest.SpyInstance | null,
  setup: () => {
    mockGoogleAuth.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-uid-123456",
        email: "test@example.com",
        name: "Test User",
        email_verified: true,
      }),
    });

    if (mockGoogleAuth.spy) {
      mockGoogleAuth.spy.mockRestore();
    }
    mockGoogleAuth.spy = jest
      .spyOn(OAuth2Client.prototype, "verifyIdToken")
      .mockImplementation(mockGoogleAuth.verifyIdToken);
  },
  reset: () => {
    mockGoogleAuth.verifyIdToken.mockReset();
    if (mockGoogleAuth.spy) {
      mockGoogleAuth.spy.mockRestore();
      mockGoogleAuth.spy = null;
    }
  },
};
