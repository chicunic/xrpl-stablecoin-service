import { handleRouteError, ValidationError } from "@common/utils/error.handler.js";
import { getTokenConfig, toXrplCurrency } from "@token/config/tokens.js";
import { type AuthenticatedRequest, requireAuth, requireKyc } from "@token/middleware/auth.js";
import { getUserWallet } from "@token/services/auth.service.js";
import {
  buildOfferAmounts,
  cancelOffer,
  createPermissionedOffer,
  getPermissionedOrderBook,
  tfHybrid,
} from "@token/services/dex.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/dex/offers", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const { tokenId, side, amount, price, hybrid } = req.body;

    const wallet = await getUserWallet(uid);
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const config = getTokenConfig(tokenId);
    if (!config.permissionedDomainId) {
      throw new ValidationError("Permissioned domain not configured for this token");
    }

    const { takerGets, takerPays } = buildOfferAmounts(tokenId, side, amount, price);
    const flags = hybrid ? tfHybrid : undefined;

    const result = await createPermissionedOffer(
      wallet.bipIndex,
      wallet.address,
      takerGets,
      takerPays,
      config.permissionedDomainId,
      flags,
    );

    res.status(201).json(result);
  } catch (error) {
    handleRouteError(error, res, "POST /dex/offers");
  }
});

router.delete("/dex/offers/:offerSequence", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const offerSequence = Number.parseInt(req.params.offerSequence as string, 10);

    const wallet = await getUserWallet(uid);
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const txHash = await cancelOffer(wallet.bipIndex, wallet.address, offerSequence);
    res.json({ txHash });
  } catch (error) {
    handleRouteError(error, res, "DELETE /dex/offers/:offerSequence");
  }
});

router.get("/dex/orderbook", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const tokenId = req.query.tokenId as string | undefined;
    if (!tokenId) {
      throw new ValidationError("tokenId query parameter is required");
    }

    const config = getTokenConfig(tokenId);
    if (!config.permissionedDomainId) {
      throw new ValidationError("Permissioned domain not configured for this token");
    }

    const xrplCurrency = toXrplCurrency(config.currency);
    const orderBook = await getPermissionedOrderBook(
      config.permissionedDomainId,
      { currency: xrplCurrency, issuer: config.issuerAddress },
      { currency: "XRP" },
    );

    res.json(orderBook);
  } catch (error) {
    handleRouteError(error, res, "GET /dex/orderbook");
  }
});

export default router;
