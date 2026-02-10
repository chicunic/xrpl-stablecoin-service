import { handleRouteError } from "@common/utils/error.handler.js";
import { type AuthenticatedRequest, requireAuth } from "@token/middleware/auth.js";
import { getOrCreateUser, getVirtualAccount, setupVirtualAccount, setupWallet } from "@token/services/auth.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.get("/users/me", requireAuth, async (req, res: Response) => {
  try {
    const { uid, email, name } = (req as AuthenticatedRequest).user;
    const user = await getOrCreateUser(uid, email, name);
    res.json(user);
  } catch (error) {
    handleRouteError(error, res, "GET /users/me");
  }
});

router.post("/users/me/wallet", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const wallet = await setupWallet(uid);
    res.status(201).json({ address: wallet.address });
  } catch (error) {
    handleRouteError(error, res, "POST /users/me/wallet");
  }
});

router.get("/users/me/virtual-account", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const va = await getVirtualAccount(uid);
    if (!va) {
      res.status(404).json({ error: "Virtual account not found" });
      return;
    }
    res.json(va);
  } catch (error) {
    handleRouteError(error, res, "GET /users/me/virtual-account");
  }
});

router.post("/users/me/virtual-account", requireAuth, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const virtualAccount = await setupVirtualAccount(uid);
    res.status(201).json(virtualAccount);
  } catch (error) {
    handleRouteError(error, res, "POST /users/me/virtual-account");
  }
});

export default router;
