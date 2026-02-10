import { handleRouteError } from "@common/utils/error.handler.js";
import { getProjectAuth } from "@token/middleware/auth.js";
import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

const SESSION_EXPIRES_IN = 14 * 24 * 60 * 60 * 1000; // 14 days
const AUTH_TIME_MAX_AGE = 5 * 60; // 5 minutes

router.post("/session/login", async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) {
      res.status(400).json({ error: "Missing idToken" });
      return;
    }

    const decoded = await getProjectAuth().verifyIdToken(idToken);
    const authTime = (decoded.auth_time as number) ?? 0;
    const now = Math.floor(Date.now() / 1000);
    if (now - authTime > AUTH_TIME_MAX_AGE) {
      res.status(401).json({ error: "Recent sign-in required" });
      return;
    }

    const sessionToken = await getProjectAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN,
    });

    res.json({ status: "ok", sessionToken });
  } catch (error) {
    handleRouteError(error, res, "POST /session/login");
  }
});

router.post("/session/refresh", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const existingSession = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!existingSession) {
      res.status(401).json({ error: "No existing session" });
      return;
    }

    // Verify the existing session is valid
    await getProjectAuth().verifySessionCookie(existingSession, true);

    const { idToken } = req.body as { idToken?: string };
    if (!idToken) {
      res.status(400).json({ error: "Missing idToken" });
      return;
    }

    const sessionToken = await getProjectAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN,
    });

    res.json({ status: "ok", sessionToken });
  } catch (error) {
    handleRouteError(error, res, "POST /session/refresh");
  }
});

router.post("/session/logout", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export default router;
