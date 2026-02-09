import { ValidationError } from "@common/utils/error.handler.js";

interface PubSubEnvelope {
  message: {
    data: string;
    messageId: string;
  };
}

export function parsePubSubMessage<T>(body: unknown): { data: T; messageId: string } {
  const envelope = body as PubSubEnvelope;

  if (!envelope?.message?.data || !envelope?.message?.messageId) {
    throw new ValidationError("Invalid Pub/Sub message envelope");
  }

  const decoded = Buffer.from(envelope.message.data, "base64").toString("utf-8");

  let data: T;
  try {
    data = JSON.parse(decoded) as T;
  } catch {
    throw new ValidationError("Invalid Pub/Sub message data: not valid JSON");
  }

  return { data, messageId: envelope.message.messageId };
}
