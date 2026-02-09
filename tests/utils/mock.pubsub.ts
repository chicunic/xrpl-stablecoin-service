import { createJestMock, createSimpleModuleMock } from "./mock.factory";

export const mockPubSubService = {
  publishMessage: createJestMock(),
  initializePubSub: createJestMock(),
  getPubSubClient: createJestMock(),
  setup: () => {
    mockPubSubService.publishMessage.mockResolvedValue("mock-message-id");
    mockPubSubService.initializePubSub.mockReturnValue(undefined);
    mockPubSubService.getPubSubClient.mockReturnValue({});
  },
  reset: () => {
    mockPubSubService.publishMessage.mockReset();
    mockPubSubService.initializePubSub.mockReset();
    mockPubSubService.getPubSubClient.mockReset();
  },
};

export function enablePubSubServiceMock() {
  createSimpleModuleMock("../../src/common/config/pubsub", {
    publishMessage: mockPubSubService.publishMessage,
    initializePubSub: mockPubSubService.initializePubSub,
    getPubSubClient: mockPubSubService.getPubSubClient,
    BANK_DEPOSIT_TOPIC: "bank-deposit-events",
  });
}
