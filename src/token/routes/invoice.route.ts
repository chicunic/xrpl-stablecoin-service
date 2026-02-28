import { handleRouteError } from "@common/utils/error.handler.js";
import {
  type AuthenticatedRequest,
  requireAuth,
  requireKyc,
  requireMfa,
  requireOperationMfa,
} from "@token/middleware/auth.js";
import type { InvoiceData } from "@token/services/invoice.service.js";
import { cancelInvoice, getInvoice, listInvoices, payInvoice, sendInvoice } from "@token/services/invoice.service.js";
import { parseInvoicePdf } from "@token/services/invoice-pdf.service.js";
import type { InvoiceType } from "@token/types/invoice.type.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

const router: RouterType = Router();

router.post("/invoices/pay/parse-pdf", requireAuth, upload.single("pdf"), async (req, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "PDF file is required" });
      return;
    }
    const data = await parseInvoicePdf(req.file.buffer);
    res.json(data);
  } catch (error) {
    handleRouteError(error, res, "POST /invoices/parse-pdf");
  }
});

/** Send an invoice to someone */
router.post("/invoices/send", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const invoice = await sendInvoice(uid, req.body as InvoiceData);
    res.status(201).json(invoice);
  } catch (error) {
    handleRouteError(error, res, "POST /invoices/send");
  }
});

/** Pay a received invoice */
router.post("/invoices/pay", requireAuth, requireKyc, requireMfa, requireOperationMfa, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const invoice = await payInvoice(uid, req.body as InvoiceData);
    res.status(201).json(invoice);
  } catch (error) {
    handleRouteError(error, res, "POST /invoices/pay");
  }
});

router.get("/invoices", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const type = req.query.type as InvoiceType | undefined;
    const invoices = await listInvoices(uid, type);
    res.json(invoices);
  } catch (error) {
    handleRouteError(error, res, "GET /invoices");
  }
});

router.get("/invoices/:invoiceId", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const invoice = await getInvoice(uid, req.params.invoiceId as string);
    res.json(invoice);
  } catch (error) {
    handleRouteError(error, res, "GET /invoices/:invoiceId");
  }
});

router.post("/invoices/:invoiceId/cancel", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const invoice = await cancelInvoice(uid, req.params.invoiceId as string);
    res.json(invoice);
  } catch (error) {
    handleRouteError(error, res, "POST /invoices/:invoiceId/cancel");
  }
});

export default router;
