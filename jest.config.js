module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  testTimeout: 30000,
  verbose: true,
  // Don't watch node_modules
  testPathIgnorePatterns: ["/node_modules/"],
};
