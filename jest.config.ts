import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["<rootDir>/tests/**/*.test.ts", "<rootDir>/tests/**/*.spec.ts"],

  collectCoverageFrom: [
    "src/**/*.{ts,js}",
    "!src/**/*.d.ts",
    "!src/token/index.ts",
    "!src/bank/index.ts",
    "!src/common/config/firebase.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@token/(.*)\\.js$": "<rootDir>/src/token/$1",
    "^@token/(.*)$": "<rootDir>/src/token/$1",
    "^@bank/(.*)\\.js$": "<rootDir>/src/bank/$1",
    "^@bank/(.*)$": "<rootDir>/src/bank/$1",
    "^@common/(.*)\\.js$": "<rootDir>/src/common/$1",
    "^@common/(.*)$": "<rootDir>/src/common/$1",
  },

  testTimeout: 15000,
  maxWorkers: "50%",

  verbose: true,
  silent: false,

  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],

  clearMocks: true,
  restoreMocks: false,

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

export default config;
