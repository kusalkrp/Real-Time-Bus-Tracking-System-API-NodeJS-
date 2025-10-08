// Jest setup file that runs after the test environment is set up
const { jest } = require('@jest/globals');

// Mock console.error to reduce noise in tests unless explicitly testing error handling
const originalConsoleError = console.error;
global.mockConsoleError = () => {
  console.error = jest.fn();
};

global.restoreConsoleError = () => {
  console.error = originalConsoleError;
};

// Clean up after each test
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers();
  
  // Clear all mocks
  jest.clearAllMocks();
  
  // Restore console.error if it was mocked
  if (console.error !== originalConsoleError) {
    console.error = originalConsoleError;
  }
});

// Global test utilities
global.testUtils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  mockDateTime: (dateString) => {
    const mockDate = new Date(dateString);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
    return mockDate;
  }
};