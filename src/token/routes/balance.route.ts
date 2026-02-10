import { handleRouteError } from "@common/utils/error.handler.js";
import { getAllTokenConfigs } from "@token/config/tokens.js";
import { type AuthenticatedRequest, requireAuth } from "@token/middleware/auth.js";
import { getUserWallet } from "@token/services/auth.service.js";
import { getFiatBalance, getFiatTransactions } from "@token/services/fiat.service.js";
import { getTrustlines, getXrpTransactions } from "@token/services/token-balance.service.js";
import { getBalances } from "@token/services/xrpl.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.get("/balance/fiat", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const balance = await getFiatBalance(uid);
    res.json({ balance });
  } catch (error) {
    handleRouteError(error, res, "GET /balance/fiat");
  }
});

router.get("/balance/xrp", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const wallet = await getUserWallet(uid);

    if (!wallet) {
      res.status(400).json({ error: "Wallet not set up" });
      return;
    }

    const balances = await getBalances(wallet.address);
    res.json({ address: wallet.address, balances });
  } catch (error) {
    handleRouteError(error, res, "GET /balance/xrp");
  }
});

router.get("/balance/fiat/transactions", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const transactions = await getFiatTransactions(uid);
    res.json(transactions);
  } catch (error) {
    handleRouteError(error, res, "GET /balance/fiat/transactions");
  }
});

router.get("/balance/xrp/transactions", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const transactions = await getXrpTransactions(uid);
    res.json(transactions);
  } catch (error) {
    handleRouteError(error, res, "GET /balance/xrp/transactions");
  }
});

router.get("/balance/trustlines", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;

    const tokens = getAllTokenConfigs();
    const userTrustlines = await getTrustlines(uid);
    const trustlineSet = new Set(userTrustlines.map((t) => `${t.currency}:${t.issuer}`));

    const result = tokens.map((token) => ({
      tokenId: token.tokenId,
      name: token.name,
      currency: token.currency,
      issuerAddress: token.issuerAddress,
      hasTrustline: trustlineSet.has(`${token.currency}:${token.issuerAddress}`),
    }));

    res.json(result);
  } catch (error) {
    handleRouteError(error, res, "GET /balance/trustlines");
  }
});

export default router;
