import path from "node:path";
import { defineConfig } from "vitest/config";

// Targets localnet Docker deps (rippled + Firestore emulator); globalSetup manages container lifecycle and the ledger_accept timer.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    alias: {
      "@token": path.resolve(__dirname, "./src/token"),
      "@bank": path.resolve(__dirname, "./src/bank"),
      "@common": path.resolve(__dirname, "./src/common"),
    },
    testTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ["./tests/integration/setup-localnet.ts"],
    env: {
      XRPL_NETWORK: "localnet",
      SIGNING_PROVIDER: "sm",
      // Connect firebase-admin to the Firestore emulator (see docker-compose.yaml).
      FIRESTORE_EMULATOR_HOST: "localhost:8080",
      // Fixed test mnemonic for deriving holder wallets (see localnet.helper.ts TEST_MNEMONIC).
      MNEMONIC: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      // Flow tests exercise the real mfa-token service (HMAC) end to end.
      MFA_TOKEN_SECRET: "test-mfa-token-secret",
      // Flow tests stub the bank service's HTTP boundary; these only keep config getters from throwing.
      BANK_SERVICE_URL: "http://bank.test.local",
      BANK_AUTH_TOKEN: "test-bank-auth-token",
    },
  },
});
