import { type BankAuthenticatedRequest, requireBankAuth } from "@bank/middleware/bank-auth.js";
import { verifyPin } from "@bank/services/account.service.js";
import { transfer } from "@bank/services/transfer.service.js";
import { handleRouteError, ValidationError } from "@common/utils/error.handler.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/transfers", requireBankAuth, async (req, res: Response) => {
  try {
    const { accountId, tokenType } = (req as BankAuthenticatedRequest).bankUser;
    const { toBranchCode, toAccountNumber, amount, pin, idempotencyKey } = req.body as {
      toBranchCode: string;
      toAccountNumber: string;
      amount: number;
      pin?: string;
      idempotencyKey?: string;
    };

    if (tokenType === "api") {
      // API token: PIN not required
    } else {
      if (!pin) {
        throw new ValidationError("Invalid: pin is required");
      }
      await verifyPin(accountId, pin);
    }

    const result = await transfer(accountId, toBranchCode, toAccountNumber, amount, idempotencyKey);

    res.json(result);
  } catch (error) {
    handleRouteError(error, res, "POST /transfers");
  }
});

export default router;
