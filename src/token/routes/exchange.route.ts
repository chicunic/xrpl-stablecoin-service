import { handleRouteError } from "@common/utils/error.handler.js";
import { type AuthenticatedRequest, requireAuth, requireKyc } from "@token/middleware/auth.js";
import { exchangeFiatToToken, exchangeTokenToFiat } from "@token/services/exchange.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/exchange/fiat-to-xrp", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const { tokenId, fiatAmount } = req.body as {
      tokenId: string;
      fiatAmount: number;
    };

    const order = await exchangeFiatToToken(uid, tokenId, fiatAmount);
    res.status(201).json(order);
  } catch (error) {
    handleRouteError(error, res, "POST /exchange/fiat-to-xrp");
  }
});

router.post("/exchange/xrp-to-fiat", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const { tokenId, tokenAmount } = req.body as {
      tokenId: string;
      tokenAmount: number;
    };

    const order = await exchangeTokenToFiat(uid, tokenId, tokenAmount);
    res.status(201).json(order);
  } catch (error) {
    handleRouteError(error, res, "POST /exchange/xrp-to-fiat");
  }
});

export default router;
