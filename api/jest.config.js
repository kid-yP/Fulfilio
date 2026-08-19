/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  globalSetup: "<rootDir>/tests/globalSetup.ts",
  testTimeout: 15000,
};
