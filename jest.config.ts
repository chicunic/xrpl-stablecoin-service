import type { Config } from "jest";

const sharedConfig = {
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
};

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["<rootDir>/tests/**/*.test.ts", "<rootDir>/tests/**/*.spec.ts"],
  testPathIgnorePatterns: ["<rootDir>/tests/integration/"],

  collectCoverageFrom: [
    "src/**/*.{ts,js}",
    "!src/**/*.d.ts",
    "!src/token/index.ts",
    "!src/bank/index.ts",
    "!src/common/config/firebase.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],

  ...sharedConfig,

  testTimeout: 15000,
  maxWorkers: "50%",

  verbose: true,
  silent: false,

  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],

  clearMocks: true,
  restoreMocks: false,
};

export default config;
