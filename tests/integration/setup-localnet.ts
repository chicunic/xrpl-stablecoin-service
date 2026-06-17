/**
 * Vitest globalSetup for localnet integration dependencies (Docker):
 * standalone rippled + Firestore emulator.
 *
 * Only acts when XRPL_NETWORK=localnet. For other networks it is a no-op.
 *
 * Lifecycle:
 *   - If the containers are already up (ports 6006 + 8080 reachable), reuse them and leave them running.
 *   - Otherwise start them via `docker compose up -d --wait`, and tear them down after the run.
 *   - While connected, run a periodic ledger_accept so submitAndWait advances the ledger.
 */
import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import { Client } from "xrpl";

const execFileAsync = promisify(execFile);

const LOCALNET_WS_PORT = 6006;
const LOCALNET_WS_URL = `ws://localhost:${LOCALNET_WS_PORT}`;
const FIRESTORE_EMULATOR_PORT = 8080;
const LEDGER_ACCEPT_INTERVAL_MS = 500;
const PORT_READY_TIMEOUT_MS = 60_000;

let client: Client | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let startedByUs = false;

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`port ${port} did not become reachable within ${timeoutMs / 1000}s.`);
}

async function isDockerDaemonRunning(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function ledgerAccept(): Promise<void> {
  if (client?.isConnected()) {
    await client.request({ command: "ledger_accept" } as unknown as Parameters<Client["request"]>[0]);
  }
}

async function startLedgerAcceptTimer(): Promise<void> {
  client = new Client(LOCALNET_WS_URL, { timeout: 10_000 });
  await client.connect();

  // Close a few ledgers upfront so the genesis account is visible in the validated ledger.
  for (let i = 0; i < 3; i++) {
    await ledgerAccept();
  }

  timer = setInterval(() => {
    void ledgerAccept().catch(() => {
      // swallow — rippled may be busy
    });
  }, LEDGER_ACCEPT_INTERVAL_MS);
}

export async function setup(): Promise<void> {
  if (process.env.XRPL_NETWORK !== "localnet") {
    return;
  }

  const rippledUp = await isPortOpen(LOCALNET_WS_PORT);
  const firestoreUp = await isPortOpen(FIRESTORE_EMULATOR_PORT);

  if (rippledUp && firestoreUp) {
    console.log("[localnet] rippled (6006) + firestore emulator (8080) already running — reusing them");
  } else {
    if (!(await isDockerDaemonRunning())) {
      throw new Error(
        "Docker daemon is not running. Start Docker (e.g. open Docker Desktop) and retry.\n" +
          "Localnet integration tests cannot run without it.",
      );
    }
    console.log("[localnet] Starting rippled + firestore emulator via docker compose...");
    await execFileAsync("docker", ["compose", "up", "-d", "--wait"], { timeout: 300_000 });
    startedByUs = true;
    console.log("[localnet] Waiting for rippled (6006) and firestore emulator (8080)...");
    await waitForPort(LOCALNET_WS_PORT, PORT_READY_TIMEOUT_MS);
    await waitForPort(FIRESTORE_EMULATOR_PORT, PORT_READY_TIMEOUT_MS);
    console.log("[localnet] rippled + firestore emulator reachable");
  }

  await startLedgerAcceptTimer();
  console.log(`[localnet] ledger_accept timer started (every ${LEDGER_ACCEPT_INTERVAL_MS}ms)`);
}

export async function teardown(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (client?.isConnected()) {
    await client.disconnect();
    client = null;
  }
  if (startedByUs) {
    console.log("[localnet] Stopping rippled (started by this test run)...");
    try {
      await execFileAsync("docker", ["compose", "down"], { timeout: 60_000 });
    } catch (err) {
      console.error("[localnet] docker compose down failed:", err);
    }
  }
}
