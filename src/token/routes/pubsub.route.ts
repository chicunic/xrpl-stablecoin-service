import { parsePubSubMessage } from "@common/utils/pubsub.helper.js";
import { processBankDeposit } from "@token/services/deposit.service.js";
import type { Request, Response, Router as RouterType } from "express";
import { Router } from "express";

const router: RouterType = Router();

interface BankDepositEvent {
  transactionId: string;
  amount: number;
  virtualAccountNumber: string;
}

router.post("/pubsub/bank/deposit", async (req: Request, res: Response) => {
  let messageId: string | undefined;
  try {
    const { data, messageId: msgId } = parsePubSubMessage<BankDepositEvent>(req.body);
    messageId = msgId;

    const { transactionId, amount, virtualAccountNumber } = data;
    if (!transactionId || !amount || !virtualAccountNumber) {
      console.error("Invalid bank deposit event data:", data);
      res.status(200).json({ status: "skipped", reason: "invalid data" });
      return;
    }

    await processBankDeposit(messageId, transactionId, amount, virtualAccountNumber);
    res.status(200).json({ status: "ok" });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 400) {
      console.error("Pub/Sub bank deposit validation error:", error);
      res.status(200).json({ status: "skipped", reason: "validation error" });
      return;
    }
    console.error(`Pub/Sub bank deposit processing error (messageId: ${messageId}):`, error);
    res.status(500).json({ error: "Processing failed" });
  }
});

export default router;
