import { handleRouteError } from "@common/utils/error.handler.js";
import { getTokenConfig } from "@token/config/tokens.js";
import { type AuthenticatedRequest, requireAuth, requireKyc } from "@token/middleware/auth.js";
import { getUserWallet } from "@token/services/auth.service.js";
import {
  acceptCredential,
  CREDENTIAL_TYPE_KYC_JAPAN_HEX,
  getCredentialStatus,
  issueCredential,
} from "@token/services/credential.service.js";
import type { Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

router.get("/users/me/credential", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const wallet = await getUserWallet(uid);
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const { issuerAddress } = getTokenConfig("JPYN");
    const status = await getCredentialStatus(wallet.address, issuerAddress, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
    res.json(status);
  } catch (error) {
    handleRouteError(error, res, "GET /users/me/credential");
  }
});

router.post("/users/me/credential/retry", requireAuth, requireKyc, async (req, res: Response) => {
  try {
    const { uid } = (req as AuthenticatedRequest).user;
    const wallet = await getUserWallet(uid);
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const { issuerAddress } = getTokenConfig("JPYN");
    const credentialTxHash = await issueCredential(wallet.address, CREDENTIAL_TYPE_KYC_JAPAN_HEX);
    const credentialAcceptTxHash = await acceptCredential(
      wallet.bipIndex,
      wallet.address,
      issuerAddress,
      CREDENTIAL_TYPE_KYC_JAPAN_HEX,
    );

    res.json({ credentialTxHash, credentialAcceptTxHash, credentialStatus: "accepted" });
  } catch (error) {
    handleRouteError(error, res, "POST /users/me/credential/retry");
  }
});

export default router;
