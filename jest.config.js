// Jest configuration for test setup and teardown
module.exports = {
  // Test timeout
  testTimeout: 10000,
  
  // Force exit to prevent hanging
  forceExit: true,
  
  // Test environment
  testEnvironment: 'node',
  
  // Setup environment variables
  setupFiles: ['./tests/setup/jest-env.js'],
  
  // Test match patterns
  testMatch: [
    '**/tests/unit/**/*.test.js'
  ],
  
  // Coverage (disabled by default for faster tests)
  collectCoverage: false
};