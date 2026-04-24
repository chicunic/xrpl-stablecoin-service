import { ValidationError } from "@common/utils/error.handler.js";

interface PubSubEnvelope {
  message: {
    data: string;
    messageId: string;
  };
}

export function parsePubSubMessage(body: unknown): { data: unknown; messageId: string } {
  const envelope = body as PubSubEnvelope;

  if (!envelope.message.data || !envelope.message.messageId) {
    throw new ValidationError("Invalid Pub/Sub message envelope");
  }

  const decoded = Buffer.from(envelope.message.data, "base64").toString("utf-8");

  let data: unknown;
  try {
    data = JSON.parse(decoded) as unknown;
  } catch {
    throw new ValidationError("Invalid Pub/Sub message data: not valid JSON");
  }

  return { data, messageId: envelope.message.messageId };
}
