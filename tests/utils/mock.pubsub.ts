const _pubsub = vi.hoisted(() => ({
  publishMessage: vi.fn(),
  initializePubSub: vi.fn(),
  getPubSubClient: vi.fn(),
}));

vi.mock("../../src/common/config/pubsub", () => ({
  publishMessage: _pubsub.publishMessage,
  initializePubSub: _pubsub.initializePubSub,
  getPubSubClient: _pubsub.getPubSubClient,
  BANK_DEPOSIT_TOPIC: "bank-deposit-events",
}));

export const mockPubSubService = {
  publishMessage: _pubsub.publishMessage,
  initializePubSub: _pubsub.initializePubSub,
  getPubSubClient: _pubsub.getPubSubClient,
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
