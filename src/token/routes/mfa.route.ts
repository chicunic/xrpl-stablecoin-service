import { handleRouteError } from "@common/utils/error.handler.js";
import { type AuthenticatedRequest, requireAuth } from "@token/middleware/auth.js";
import { generateMfaToken } from "@token/services/mfa-token.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

const AUTH_TIME_MAX_AGE = 30; // seconds

router.post("/mfa/verify", requireAuth, async (req, res: Response) => {
  try {
    const { uid, mfaVerified, authTime } = (req as AuthenticatedRequest).user;

    if (!mfaVerified) {
      res.status(403).json({ error: "MFA not verified in ID token" });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now - authTime > AUTH_TIME_MAX_AGE) {
      res.status(403).json({ error: "Authentication too old, please reauthenticate" });
      return;
    }

    const mfaToken = await generateMfaToken(uid);

    res.cookie("__mfa_token", mfaToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "strict",
      maxAge: 300 * 1000,
      path: "/api/v1",
    });

    res.json({ status: "ok", expiresIn: 300 });
  } catch (error) {
    handleRouteError(error, res, "POST /mfa/verify");
  }
});

export default router;
