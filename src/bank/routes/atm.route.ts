import { type BankAuthenticatedRequest, rejectApiToken, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { verifyPin } from "@bank/services/account.service.js";
import { deposit, withdraw } from "@bank/services/transfer.service.js";
import { handleRouteError } from "@common/utils/error.handler.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/atm/deposit", requireBankAuth, rejectApiToken, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const { amount, pin } = req.body as { amount: number; pin: string };

    await verifyPin(accountId, pin);
    const result = await deposit(accountId, amount);

    res.json(result);
  } catch (error) {
    handleRouteError(error, res, "POST /atm/deposit");
  }
});

router.post("/atm/withdrawal", requireBankAuth, rejectApiToken, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const { amount, pin } = req.body as { amount: number; pin: string };

    await verifyPin(accountId, pin);
    const result = await withdraw(accountId, amount);

    res.json(result);
  } catch (error) {
    handleRouteError(error, res, "POST /atm/withdrawal");
  }
});

export default router;
