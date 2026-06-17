import { defaultHook } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { AckSchema } from "@token/config/response-schemas.js";
import { processXrplTokenTransaction } from "@token/services/deposit.service.js";

const app = new OpenAPIHono({ defaultHook: defaultHook() });

const EventarcBodySchema = z
  .object({
    document: z
      .object({
        name: z.string().optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .meta({ id: "EventarcDocument" });

app.openapi(
  createRoute({
    method: "post",
    path: "/eventarc/xrpl/deposit",
    summary: "Handle an Eventarc Firestore document trigger for XRPL deposits",
    tags: ["Eventarc"],
    request: {
      body: { content: { "application/json": { schema: EventarcBodySchema } }, required: true },
    },
    responses: {
      200: { content: { "application/json": { schema: AckSchema } }, description: "Acknowledged" },
      500: { content: { "application/json": { schema: AckSchema } }, description: "Processing failed" },
    },
  }),
  async (c) => {
    try {
      const event = c.req.valid("json");

      // Extract txHash from document name: projects/.../documents/tokenTransactions/{txHash}
      const documentName = event.document?.name;
      if (!documentName) {
        console.error("Invalid Eventarc event: missing document name");
        return c.json({ status: "skipped" as const, reason: "invalid event" }, 200);
      }

      const txHash = documentName.split("/").pop();
      if (!txHash) {
        console.error("Invalid Eventarc event: cannot extract txHash from", documentName);
        return c.json({ status: "skipped" as const, reason: "invalid document name" }, 200);
      }

      const data = parseFirestoreFields(event.document?.fields ?? {}) as unknown as Parameters<
        typeof processXrplTokenTransaction
      >[1];

      const result = await processXrplTokenTransaction(txHash, data);

      if (result.processed) {
        return c.json({ status: "ok" as const }, 200);
      }
      return c.json({ status: "skipped" as const, reason: result.reason }, 200);
    } catch (error) {
      console.error("Eventarc XRPL deposit processing error:", error);
      return c.json({ error: "Processing failed" }, 500);
    }
  },
);

// Parse Firestore REST API field format into plain values, e.g. { "field": { "stringValue": "abc" } } -> { field: "abc" }
function parseFirestoreValue(field: unknown): unknown {
  if (field === null || field === undefined) return null;
  const f = field as Record<string, unknown>;

  if ("stringValue" in f) return f.stringValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("nullValue" in f) return null;
  if ("timestampValue" in f) return f.timestampValue;
  if ("mapValue" in f) {
    const mapFields = (f.mapValue as { fields?: Record<string, unknown> }).fields;
    return mapFields ? parseFirestoreFields(mapFields) : {};
  }
  if ("arrayValue" in f) {
    const values = (f.arrayValue as { values?: unknown[] }).values;
    return values ? values.map(parseFirestoreValue) : [];
  }
  return f;
}

function parseFirestoreFields(fields: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = parseFirestoreValue(value);
  }
  return result;
}

export default app;
