import { handleRouteError } from "@common/utils/error.handler.js";
import {
  type AuthenticatedRequest,
  requireAuth,
  requireKyc,
  requireMfa,
  requireOperationMfa,
} from "@token/middleware/auth.js";
import { withdrawFiat, withdrawXrp } from "@token/services/withdrawal.service.js";
import type { BankAccount } from "@token/types/user.type.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/withdraw/fiat", requireAuth, requireKyc, requireMfa, requireOperationMfa, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const { amount, bankAccount } = req.body as {
      amount: number;
      bankAccount: BankAccount;
    };

    const result = await withdrawFiat(uid, amount, bankAccount);
    res.status(201).json(result);
  } catch (error) {
    handleRouteError(error, res, "POST /withdraw/fiat");
  }
});

router.post("/withdraw/xrp", requireAuth, requireKyc, requireMfa, requireOperationMfa, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const { tokenId, tokenAmount, destinationAddress } = req.body as {
      tokenId: string;
      tokenAmount: number;
      destinationAddress: string;
    };

    const result = await withdrawXrp(uid, tokenId, tokenAmount, destinationAddress);
    res.status(201).json(result);
  } catch (error) {
    handleRouteError(error, res, "POST /withdraw/xrp");
  }
});

export default router;
