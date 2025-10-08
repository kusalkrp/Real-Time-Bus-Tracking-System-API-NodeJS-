// Global Jest setup for all tests
module.exports = async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key-for-jwt-tokens';
  process.env.PORT = '3001'; // Different port for tests
};