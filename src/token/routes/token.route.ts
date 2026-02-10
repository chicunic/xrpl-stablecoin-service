import { handleRouteError } from "@common/utils/error.handler.js";
import { getAllTokenConfigs, getTokenConfig } from "@token/config/tokens.js";
import { type AuthenticatedRequest, requireAuth } from "@token/middleware/auth.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { createTrustlineDoc } from "@token/services/token-balance.service.js";
import { ensureTrustLine } from "@token/services/trustline.service.js";
import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.get("/tokens", requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json(getAllTokenConfigs());
  } catch (error) {
    handleRouteError(error, res, "GET /tokens");
  }
});

router.get("/tokens/:tokenId", requireAuth, async (req: Request, res: Response) => {
  try {
    const config = getTokenConfig(req.params.tokenId as string);
    res.json(config);
  } catch (error) {
    handleRouteError(error, res, "GET /tokens/:tokenId");
  }
});

router.post("/tokens/:tokenId/trustline", requireAuth, async (req: Request, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const tokenId = req.params.tokenId as string;
    const config = getTokenConfig(tokenId);

    const wallet = await getUserWallet(uid);
    if (!wallet) {
      res.status(400).json({ error: "Wallet not set up" });
      return;
    }

    await ensureTrustLine(wallet.bipIndex, wallet.address, config.currency, config.issuerAddress);
    await createTrustlineDoc(uid, config.currency, config.issuerAddress);
    res.json({ tokenId, currency: config.currency, status: "ok" });
  } catch (error) {
    handleRouteError(error, res, "POST /tokens/:tokenId/trustline");
  }
});

export default router;
