const _checkAndMarkProcessed = vi.hoisted(() => vi.fn());

vi.mock("../../src/common/utils/idempotency", () => ({
  checkAndMarkProcessed: _checkAndMarkProcessed,
}));

export const mockIdempotency = {
  checkAndMarkProcessed: _checkAndMarkProcessed,
  setup: () => {
    mockIdempotency.checkAndMarkProcessed.mockResolvedValue(false);
  },
  reset: () => {
    mockIdempotency.checkAndMarkProcessed.mockReset();
  },
};
