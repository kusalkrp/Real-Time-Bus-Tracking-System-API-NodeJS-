#!/usr/bin/env node

const { execSync } = require('child_process');

function checkDockerServices() {
  console.log('🔍 Checking Docker services status...\n');

  try {
    // Check if Docker is running
    execSync('docker info', { stdio: 'pipe' });
    console.log('✅ Docker is running');
  } catch (error) {
    console.error('❌ Docker is not running. Please start Docker Desktop.');
    process.exit(1);
  }

  try {
    // Check if docker-compose services are running
    const output = execSync('docker-compose ps', { encoding: 'utf8' });

    const services = [
      { name: 'bus_tracking_db', description: 'PostgreSQL Database' },
      { name: 'bus_tracking_redis', description: 'Redis Cache' },
      { name: 'bus_tracking_api', description: 'Node.js API Server' }
    ];
    let allRunning = true;

    services.forEach(service => {
      if (output.includes(service.name) && output.includes('Up')) {
        console.log(`✅ ${service.name} (${service.description}) is running`);
      } else {
        console.log(`❌ ${service.name} (${service.description}) is not running`);
        allRunning = false;
      }
    });

    if (!allRunning) {
      console.log('\n💡 Run the following command to start services:');
      console.log('   docker-compose up -d');
      process.exit(1);
    }

    console.log('\n🎉 All Docker services are running!');
    console.log('� Service Status Summary:');
    console.log('   • PostgreSQL 15 with NTC-compliant schema');
    console.log('   • Redis 7 for caching and sessions');
    console.log('   • Node.js API with role-based authentication');
    console.log('');
    console.log('🚀 You can now run tests:');
    console.log('   npm run test            - Unit tests');
    console.log('   npm run test:integration - Integration tests');
    console.log('   npm run test:coverage   - Coverage report');

  } catch (error) {
    console.error('❌ Failed to check docker-compose services');
    console.log('\n💡 Make sure you\'re in the project root directory and run:');
    console.log('   docker-compose up -d');
    process.exit(1);
  }
}

if (require.main === module) {
  checkDockerServices();
}

module.exports = { checkDockerServices };