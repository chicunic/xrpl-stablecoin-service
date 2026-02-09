import { type BankAuthenticatedRequest, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { getTransactionsByAccount } from "@bank/services/transaction.service.js";
import { handleRouteError } from "@common/utils/error.handler.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.get("/transactions", requireBankAuth, async (req, res: Response) => {
  try {
    const { accountId } = (req as BankAuthenticatedRequest).bankUser;
    const transactions = await getTransactionsByAccount(accountId);

    res.json(transactions);
  } catch (error) {
    handleRouteError(error, res, "GET /transactions");
  }
});

export default router;
