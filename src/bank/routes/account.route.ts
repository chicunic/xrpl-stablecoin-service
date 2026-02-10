import {
  type BankAuthenticatedRequest,
  generateApiToken,
  generateToken,
  rejectApiToken,
  requireBankAuth,
} from "@bank/middleware/bank-auth.js";
import {
  changePin,
  createAccount,
  getAccountById,
  login,
  lookupAccount,
  updateAccount,
} from "@bank/services/account.service.js";
import { handleRouteError } from "@common/utils/error.handler.js";
import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/accounts", async (req: Request, res: Response) => {
  try {
    const { pin, accountHolder, accountType } = req.body as {
      pin: string;
      accountHolder: string;
      accountType?: "personal" | "corporate";
    };

    const account = await createAccount(pin, accountHolder, accountType);

    res.status(201).json(account);
  } catch (error) {
    handleRouteError(error, res, "POST /accounts");
  }
});

router.post("/accounts/login", async (req: Request, res: Response) => {
  try {
    const { branchCode, accountNumber, pin } = req.body as {
      branchCode: string;
      accountNumber: string;
      pin: string;
    };

    const account = await login(branchCode, accountNumber, pin);
    const token = await generateToken(account.accountId);

    const { pin: _, ...safeAccount } = account;

    res.json({ token, account: safeAccount });
  } catch (error) {
    handleRouteError(error, res, "POST /accounts/login");
  }
});

router.post("/accounts/logout", (_req: Request, res: Response) => {
  res.json({ message: "Logged out" });
});

router.get("/accounts/lookup", async (req: Request, res: Response) => {
  try {
    const branchCode = req.query.branchCode as string;
    const accountNumber = req.query.accountNumber as string;

    if (!branchCode || !accountNumber) {
      res.status(400).json({ error: "Invalid: branchCode and accountNumber are required" });
      return;
    }

    const result = await lookupAccount(branchCode, accountNumber);

    if (!result) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    res.json(result);
  } catch (error) {
    handleRouteError(error, res, "GET /accounts/lookup");
  }
});

router.get("/accounts/me", requireBankAuth, rejectApiToken, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const account = await getAccountById(accountId);

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const { pin: _, ...safeAccount } = account;
    res.json(safeAccount);
  } catch (error) {
    handleRouteError(error, res, "GET /accounts/me");
  }
});

router.post("/accounts/me/api-token", requireBankAuth, rejectApiToken, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const account = await getAccountById(accountId);

    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    if (account.accountType !== "corporate") {
      res.status(403).json({ error: "API token generation is only available for corporate accounts" });
      return;
    }

    const apiToken = await generateApiToken(accountId);
    res.json({ token: apiToken });
  } catch (error) {
    handleRouteError(error, res, "POST /accounts/me/api-token");
  }
});

router.patch("/accounts/me", requireBankAuth, rejectApiToken, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const { accountHolder, pin, oldPin, pubsubEnabled } = req.body as {
      accountHolder?: string;
      pin?: string;
      oldPin?: string;
      pubsubEnabled?: boolean;
    };

    if (pin !== undefined) {
      if (!oldPin) {
        res.status(400).json({ error: "Invalid: oldPin is required to change PIN" });
        return;
      }
      await changePin(accountId, oldPin, pin);
    }

    if (pubsubEnabled !== undefined) {
      const account = await getAccountById(accountId);
      if (account?.accountType !== "corporate") {
        res.status(403).json({ error: "Pub/Sub notifications are only available for corporate accounts" });
        return;
      }
    }

    if (accountHolder !== undefined || pubsubEnabled !== undefined) {
      const updated = await updateAccount(accountId, { accountHolder, pubsubEnabled });
      res.json(updated);
      return;
    }

    if (pin !== undefined) {
      res.json({ message: "PIN updated successfully" });
      return;
    }

    res.status(400).json({ error: "Invalid: no update fields provided" });
  } catch (error) {
    handleRouteError(error, res, "PATCH /accounts/me");
  }
});

export default router;
