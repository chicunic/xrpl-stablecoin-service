import { initializeFirebase } from "@common/config/firebase.js";
import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import app from "@token/app.js";

dotenv.config();

process.env.NODE_ENV ??= "development";

initializeFirebase();

const port = Number(process.env.PORT ?? 8080);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on port ${String(port)} (${process.env.NODE_ENV ?? ""})`);
});
