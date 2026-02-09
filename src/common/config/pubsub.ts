import { PubSub } from "@google-cloud/pubsub";

export const BANK_DEPOSIT_TOPIC = "bank-deposit-events";

let pubSubClient: PubSub | null = null;

export function initializePubSub(): void {
  if (pubSubClient) return;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId && !process.env.PUBSUB_EMULATOR_HOST) {
    console.warn("Pub/Sub: GOOGLE_CLOUD_PROJECT not set and no emulator configured, skipping initialization");
    return;
  }

  pubSubClient = new PubSub({ projectId });
  console.log("Pub/Sub client initialized");
}

export function getPubSubClient(): PubSub {
  if (!pubSubClient) {
    throw new Error("Pub/Sub client not initialized");
  }
  return pubSubClient;
}

export async function publishMessage(topicName: string, data: Record<string, unknown>): Promise<string> {
  const client = getPubSubClient();
  const dataBuffer = Buffer.from(JSON.stringify(data));
  const messageId = await client.topic(topicName).publishMessage({ data: dataBuffer });
  return messageId;
}
