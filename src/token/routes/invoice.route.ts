import { MAX_SAFE_AMOUNT } from "@common/utils/amount.js";
import { serializeTimestamps } from "@common/utils/json.replacer.js";
import { defaultHook, jsonError } from "@common/utils/problem.js";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { InvoiceSchema, ParsedInvoiceDataSchema } from "@token/config/response-schemas.js";
import { type AuthEnv, requireAuth, requireKyc, requireMfa, requireOperationMfa } from "@token/middleware/auth.js";
import { cancelInvoice, getInvoice, listInvoices, payInvoice, sendInvoice } from "@token/services/invoice.service.js";
import { parseInvoicePdf } from "@token/services/invoice-pdf.service.js";
import { HTTPException } from "hono/http-exception";

const app = new OpenAPIHono<AuthEnv>({ defaultHook: defaultHook() });

const MAX_PDF_BYTES = 5 * 1024 * 1024;

const InvoiceInput = z
  .object({
    tokenId: z.string().min(1),
    amount: z.number().int().min(1).max(MAX_SAFE_AMOUNT),
    recipientAddress: z.string(),
    recipientName: z.string().min(1),
    description: z.string().min(1),
    dueDate: z.string().optional(),
    invoiceId: z.string().optional(),
  })
  .meta({ id: "InvoiceInput" });

app.openapi(
  createRoute({
    method: "post",
    path: "/invoices/pay/parse-pdf",
    summary: "Parse an invoice PDF",
    tags: ["Invoice"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({ pdf: z.any().meta({ type: "string", format: "binary" }) }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: { content: { "application/json": { schema: ParsedInvoiceDataSchema } }, description: "Parsed invoice" },
      400: jsonError("PDF file is required"),
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.pdf;
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "PDF file is required" });
    }
    if (file.type !== "application/pdf") {
      throw new HTTPException(400, { message: "Only PDF files are allowed" });
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new HTTPException(400, { message: "PDF file is too large" });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await parseInvoicePdf(buffer);
    return c.json(serializeTimestamps(data), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/invoices/send",
    summary: "Send an invoice",
    tags: ["Invoice"],
    security: [{ session: [] }],
    middleware: [requireAuth, requireKyc],
    request: { body: { content: { "application/json": { schema: InvoiceInput } }, required: true } },
    responses: {
      201: { content: { "application/json": { schema: InvoiceSchema } }, description: "Invoice sent" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const invoice = await sendInvoice(uid, c.req.valid("json"));
    return c.json(serializeTimestamps(invoice), 201);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/invoices/pay",
    summary: "Pay a received invoice",
    tags: ["Invoice"],
    security: [{ session: [] }],
    middleware: [requireAuth, requireKyc, requireMfa, requireOperationMfa],
    request: { body: { content: { "application/json": { schema: InvoiceInput } }, required: true } },
    responses: {
      201: { content: { "application/json": { schema: InvoiceSchema } }, description: "Invoice paid" },
      400: jsonError("Validation error"),
      401: jsonError("Unauthorized"),
      403: jsonError("KYC/MFA required"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const invoice = await payInvoice(uid, c.req.valid("json"));
    return c.json(serializeTimestamps(invoice), 201);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/invoices",
    summary: "List invoices",
    tags: ["Invoice"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    request: {
      query: z.object({
        type: z
          .enum(["send", "pay"])
          .optional()
          .meta({ param: { name: "type", in: "query" } }),
      }),
    },
    responses: {
      200: { content: { "application/json": { schema: z.array(InvoiceSchema) } }, description: "Invoices" },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { type } = c.req.valid("query");
    const invoices = await listInvoices(uid, type);
    return c.json(serializeTimestamps(invoices), 200);
  },
);

app.openapi(
  createRoute({
    method: "get",
    path: "/invoices/{invoiceId}",
    summary: "Get an invoice",
    tags: ["Invoice"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    request: { params: z.object({ invoiceId: z.string().meta({ param: { name: "invoiceId", in: "path" } }) }) },
    responses: {
      200: { content: { "application/json": { schema: InvoiceSchema } }, description: "Invoice" },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { invoiceId } = c.req.valid("param");
    const invoice = await getInvoice(uid, invoiceId);
    return c.json(serializeTimestamps(invoice), 200);
  },
);

app.openapi(
  createRoute({
    method: "post",
    path: "/invoices/{invoiceId}/cancel",
    summary: "Cancel an invoice",
    tags: ["Invoice"],
    security: [{ session: [] }],
    middleware: [requireAuth],
    request: { params: z.object({ invoiceId: z.string().meta({ param: { name: "invoiceId", in: "path" } }) }) },
    responses: {
      200: { content: { "application/json": { schema: InvoiceSchema } }, description: "Invoice cancelled" },
      401: jsonError("Unauthorized"),
    },
  }),
  async (c) => {
    const { uid } = c.get("user");
    const { invoiceId } = c.req.valid("param");
    const invoice = await cancelInvoice(uid, invoiceId);
    return c.json(serializeTimestamps(invoice), 200);
  },
);

export default app;
