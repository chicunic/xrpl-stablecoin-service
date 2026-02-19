import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/integration"],
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@token/(.*)\\.js$": "<rootDir>/src/token/$1",
    "^@token/(.*)$": "<rootDir>/src/token/$1",
    "^@bank/(.*)\\.js$": "<rootDir>/src/bank/$1",
    "^@bank/(.*)$": "<rootDir>/src/bank/$1",
    "^@common/(.*)\\.js$": "<rootDir>/src/common/$1",
    "^@common/(.*)$": "<rootDir>/src/common/$1",
  },

  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },

  transformIgnorePatterns: ["node_modules/(?!(.*\\.mjs$|@grpc/.*|firebase-admin/.*))"],

  // No mock setup — tests hit real devnet
  // No clearMocks — no mocks to clear

  testTimeout: 120_000, // 2 min per test (network latency + ledger close)
  maxWorkers: 1, // Sequential — tests share ledger state
  verbose: true,
  silent: false,
};

export default config;
