import app from "@bank/app.js";
import { initializeFirebase } from "@common/config/firebase.js";
import { initializePubSub } from "@common/config/pubsub.js";
import { serve } from "@hono/node-server";
import dotenv from "dotenv";

dotenv.config();

process.env.NODE_ENV ??= "development";

initializeFirebase();
initializePubSub();

const port = Number(process.env.PORT ?? 8080);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Bank server running on port ${String(port)} (${process.env.NODE_ENV ?? ""})`);
});
