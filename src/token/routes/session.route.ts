import { handleRouteError } from "@common/utils/error.handler.js";
import { getProjectAuth } from "@token/middleware/auth.js";
import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

const SESSION_EXPIRES_IN = 14 * 24 * 60 * 60 * 1000; // 14 days
const AUTH_TIME_MAX_AGE = 5 * 60; // 5 minutes

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax" as const,
    maxAge: SESSION_EXPIRES_IN,
    path: "/",
  };
}

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

    const sessionCookie = await getProjectAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN,
    });

    res.cookie("__session", sessionCookie, sessionCookieOptions());
    res.json({ status: "ok" });
  } catch (error) {
    handleRouteError(error, res, "POST /session/login");
  }
});

router.post("/session/refresh", async (req: Request, res: Response) => {
  try {
    const existingSession = (req.cookies as Record<string, string | undefined>)?.__session;
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

    const sessionCookie = await getProjectAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN,
    });

    res.cookie("__session", sessionCookie, sessionCookieOptions());
    res.json({ status: "ok" });
  } catch (error) {
    handleRouteError(error, res, "POST /session/refresh");
  }
});

router.post("/session/logout", (_req: Request, res: Response) => {
  res.clearCookie("__session", { path: "/" });
  res.json({ status: "ok" });
});

export default router;
