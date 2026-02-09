import { createJestMock, createSimpleModuleMock } from "./mock.factory";

export const mockIdempotency = {
  checkAndMarkProcessed: createJestMock(),
  setup: () => {
    mockIdempotency.checkAndMarkProcessed.mockResolvedValue(false);
  },
  reset: () => {
    mockIdempotency.checkAndMarkProcessed.mockReset();
  },
};

export function enableIdempotencyMock() {
  createSimpleModuleMock("../../src/common/utils/idempotency", {
    checkAndMarkProcessed: mockIdempotency.checkAndMarkProcessed,
  });
}
