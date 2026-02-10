import { handleRouteError } from "@common/utils/error.handler.js";
import { type AuthenticatedRequest, requireAuth } from "@token/middleware/auth.js";
import { generateMfaToken } from "@token/services/mfa-token.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/mfa/verify", requireAuth, async (req, res: Response) => {
  try {
    const { uid, mfaVerified } = (req as AuthenticatedRequest).user;

    if (!mfaVerified) {
      res.status(403).json({ error: "MFA not verified in ID token" });
      return;
    }

    const mfaToken = await generateMfaToken(uid);

    res.json({ status: "ok", mfaToken, expiresIn: 300 });
  } catch (error) {
    handleRouteError(error, res, "POST /mfa/verify");
  }
});

export default router;
