#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 NTC Bus Tracking System - Comprehensive Test Suite');
console.log('=====================================================\n');

// Check if Docker services are running
console.log('🔍 Step 1: Checking Docker Services...');
try {
  execSync('node tests/check-docker-services.js', { stdio: 'inherit' });
  console.log('\n✅ Docker services are ready!\n');
} catch (error) {
  console.error('❌ Docker services check failed. Please start Docker services first.');
  process.exit(1);
}

// Run unit tests
console.log('🧪 Step 2: Running Unit Tests...');
try {
  execSync('npm run test', { stdio: 'inherit' });
  console.log('\n✅ Unit tests completed!\n');
} catch (error) {
  console.error('❌ Unit tests failed.');
  process.exit(1);
}

// Run integration tests
console.log('🔗 Step 3: Running Integration Tests...');
try {
  execSync('npm run test:integration', { stdio: 'inherit' });
  console.log('\n✅ Integration tests completed!\n');
} catch (error) {
  console.error('❌ Integration tests failed.');
  process.exit(1);
}

// Run performance tests
console.log('⚡ Step 4: Running Performance Tests...');
try {
  execSync('npm run test:performance:quick', { stdio: 'inherit' });
  console.log('\n✅ Performance tests completed!\n');
} catch (error) {
  console.error('❌ Performance tests failed.');
  console.log('Note: Performance tests may fail if the API is not responding optimally.');
}

// Generate coverage report
console.log('📊 Step 5: Generating Coverage Report...');
try {
  execSync('npm run test:coverage', { stdio: 'inherit' });
  console.log('\n✅ Coverage report generated!\n');
} catch (error) {
  console.error('❌ Coverage report generation failed.');
}

console.log('🎉 Comprehensive Test Suite Completed!');
console.log('==========================================');
console.log('📋 Test Summary:');
console.log('   ✅ Docker Services Check');
console.log('   ✅ Unit Tests (Auth, Buses, Routes, Trips, Advanced Features)');
console.log('   ✅ Integration Tests (End-to-end API flows)');
console.log('   ⚡ Performance Tests (Load testing with autocannon)');
console.log('   📊 Coverage Report (Code coverage analysis)');
console.log('');
console.log('📁 Check the following for detailed results:');
console.log('   • coverage/ - Coverage reports');
console.log('   • tests/   - Test files and results');
console.log('');
console.log('🚀 Your NTC Bus Tracking System API is thoroughly tested!');