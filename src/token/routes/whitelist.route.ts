import { handleRouteError } from "@common/utils/error.handler.js";
import {
  type AuthenticatedRequest,
  requireAuth,
  requireKyc,
  requireMfa,
  requireOperationMfa,
} from "@token/middleware/auth.js";
import {
  addBankWhitelist,
  addXrpWhitelist,
  getBankWhitelist,
  getXrpWhitelist,
  removeBankWhitelist,
  removeXrpWhitelist,
} from "@token/services/whitelist.service.js";
import type { BankAccount } from "@token/types/user.type.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.get("/whitelist/xrp", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const whitelist = await getXrpWhitelist(uid);
    res.json(whitelist);
  } catch (error) {
    handleRouteError(error, res, "GET /whitelist/xrp");
  }
});

router.post("/whitelist/xrp", requireAuth, requireKyc, requireMfa, requireOperationMfa, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const { address, label } = req.body as { address: string; label: string };

    const entry = await addXrpWhitelist(uid, address, label);
    res.status(201).json(entry);
  } catch (error) {
    handleRouteError(error, res, "POST /whitelist/xrp");
  }
});

router.delete(
  "/whitelist/xrp/:address",
  requireAuth,
  requireKyc,
  requireMfa,
  requireOperationMfa,
  async (req, res: Response) => {
    try {
      const { uid } = (req as AuthenticatedRequest).user;
      await removeXrpWhitelist(uid, req.params.address as string);
      res.json({ status: "ok" });
    } catch (error) {
      handleRouteError(error, res, "DELETE /whitelist/xrp/:address");
    }
  },
);

router.get("/whitelist/bank", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const whitelist = await getBankWhitelist(uid);
    res.json(whitelist);
  } catch (error) {
    handleRouteError(error, res, "GET /whitelist/bank");
  }
});

router.post("/whitelist/bank", requireAuth, requireKyc, requireMfa, requireOperationMfa, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const bankAccount = req.body as Omit<BankAccount, "createdAt">;

    const entry = await addBankWhitelist(uid, bankAccount);
    res.status(201).json(entry);
  } catch (error) {
    handleRouteError(error, res, "POST /whitelist/bank");
  }
});

router.delete(
  "/whitelist/bank/:id",
  requireAuth,
  requireKyc,
  requireMfa,
  requireOperationMfa,
  async (req, res: Response) => {
    try {
      const { uid } = (req as AuthenticatedRequest).user;
      const id = req.params.id as string;
      const [branchCode, accountNumber] = id.split("-");
      if (!branchCode || !accountNumber) {
        res.status(400).json({ error: "Invalid: id must be in format branchCode-accountNumber" });
        return;
      }

      await removeBankWhitelist(uid, branchCode, accountNumber);
      res.json({ status: "ok" });
    } catch (error) {
      handleRouteError(error, res, "DELETE /whitelist/bank/:id");
    }
  },
);

export default router;
