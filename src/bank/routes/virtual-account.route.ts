import { type BankAuthenticatedRequest, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { getAccountById } from "@bank/services/account.service.js";
import {
  createVirtualAccount,
  getVirtualAccountById,
  listVirtualAccounts,
  updateVirtualAccount,
} from "@bank/services/virtual-account.service.js";
import { handleRouteError } from "@common/utils/error.handler.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/accounts/me/virtual-accounts", requireBankAuth, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;

    const account = await getAccountById(accountId);
    if (!account || account.accountType !== "corporate") {
      res.status(403).json({ error: "Invalid: only corporate accounts can create virtual accounts" });
      return;
    }

    const { label } = req.body as { label: string };
    const virtualAccount = await createVirtualAccount(accountId, label);

    res.status(201).json(virtualAccount);
  } catch (error) {
    handleRouteError(error, res, "POST /accounts/me/virtual-accounts");
  }
});

router.get("/accounts/me/virtual-accounts", requireBankAuth, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;

    const account = await getAccountById(accountId);
    if (!account || account.accountType !== "corporate") {
      res.status(403).json({ error: "Invalid: only corporate accounts can list virtual accounts" });
      return;
    }

    const virtualAccounts = await listVirtualAccounts(accountId);
    res.json(virtualAccounts);
  } catch (error) {
    handleRouteError(error, res, "GET /accounts/me/virtual-accounts");
  }
});

router.get("/accounts/me/virtual-accounts/:virtualAccountId", requireBankAuth, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const virtualAccountId = req.params.virtualAccountId as string;

    const account = await getAccountById(accountId);
    if (!account || account.accountType !== "corporate") {
      res.status(403).json({ error: "Invalid: only corporate accounts can view virtual accounts" });
      return;
    }

    const virtualAccount = await getVirtualAccountById(virtualAccountId);
    if (!virtualAccount || virtualAccount.parentAccountId !== accountId) {
      res.status(404).json({ error: "Virtual account not found" });
      return;
    }

    res.json(virtualAccount);
  } catch (error) {
    handleRouteError(error, res, "GET /accounts/me/virtual-accounts/:virtualAccountId");
  }
});

router.patch("/accounts/me/virtual-accounts/:virtualAccountId", requireBankAuth, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const virtualAccountId = req.params.virtualAccountId as string;

    const account = await getAccountById(accountId);
    if (!account || account.accountType !== "corporate") {
      res.status(403).json({ error: "Invalid: only corporate accounts can update virtual accounts" });
      return;
    }

    const virtualAccount = await getVirtualAccountById(virtualAccountId);
    if (!virtualAccount || virtualAccount.parentAccountId !== accountId) {
      res.status(404).json({ error: "Virtual account not found" });
      return;
    }

    const { label, isActive } = req.body as { label?: string; isActive?: boolean };
    const updated = await updateVirtualAccount(virtualAccountId, { label, isActive });

    res.json(updated);
  } catch (error) {
    handleRouteError(error, res, "PATCH /accounts/me/virtual-accounts/:virtualAccountId");
  }
});

export default router;
