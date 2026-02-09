import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email: string;
    name: string;
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email || !payload.email_verified) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    (req as AuthenticatedRequest).user = {
      uid: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
