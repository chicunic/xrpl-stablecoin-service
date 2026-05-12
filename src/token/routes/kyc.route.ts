import { handleRouteError } from "@common/utils/error.handler.js";
import { type AuthenticatedRequest, requireAuth } from "@token/middleware/auth.js";
import { submitKyc } from "@token/services/kyc.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.post("/users/me/kyc", requireAuth, async (req, res: Response<unknown>) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const { fullName, phoneNumber, postalCode, prefecture, city, town, address } = req.body as {
      fullName: string;
      phoneNumber: string;
      postalCode: string;
      prefecture: string;
      city: string;
      town: string;
      address: string;
    };
    const kyc = await submitKyc(uid, { fullName, phoneNumber, postalCode, prefecture, city, town, address });
    res.status(201).json(kyc);
  } catch (error) {
    handleRouteError(error, res, "POST /users/me/kyc");
  }
});

export default router;
