import { processXrplTokenTransaction } from "@token/services/deposit.service.js";
import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/eventarc/xrpl/deposit", async (req: Request, res: Response) => {
  try {
    // Eventarc Firestore trigger sends CloudEvent format
    // The document data is in req.body (parsed by Cloud Run)
    const event = req.body as {
      document?: {
        name?: string;
        fields?: Record<string, unknown>;
      };
    };

    // Extract txHash from document name: projects/.../documents/tokenTransactions/{txHash}
    const documentName = event?.document?.name;
    if (!documentName) {
      console.error("Invalid Eventarc event: missing document name");
      res.status(200).json({ status: "skipped", reason: "invalid event" });
      return;
    }

    const txHash = documentName.split("/").pop();
    if (!txHash) {
      console.error("Invalid Eventarc event: cannot extract txHash from", documentName);
      res.status(200).json({ status: "skipped", reason: "invalid document name" });
      return;
    }

    // Parse Firestore document fields into plain object
    const data = parseFirestoreFields(event.document!.fields ?? {});

    const result = await processXrplTokenTransaction(txHash, data);

    if (result.processed) {
      res.status(200).json({ status: "ok" });
    } else {
      res.status(200).json({ status: "skipped", reason: result.reason });
    }
  } catch (error) {
    console.error("Eventarc XRPL deposit processing error:", error);
    res.status(500).json({ error: "Processing failed" });
  }
});

// Parse Firestore REST API field format into plain values
// e.g. { "field": { "stringValue": "abc" } } -> { field: "abc" }
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

function parseFirestoreFields(fields: Record<string, unknown>): any {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = parseFirestoreValue(value);
  }
  return result;
}

export default router;
