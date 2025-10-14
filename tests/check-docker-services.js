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

    const services = ['bus_tracking_db', 'bus_tracking_redis', 'bus_tracking_api'];
    let allRunning = true;

    services.forEach(service => {
      if (output.includes(service) && output.includes('Up')) {
        console.log(`✅ ${service} is running`);
      } else {
        console.log(`❌ ${service} is not running`);
        allRunning = false;
      }
    });

    if (!allRunning) {
      console.log('\n💡 Run the following command to start services:');
      console.log('   docker-compose up -d');
      process.exit(1);
    }

    console.log('\n🎉 All Docker services are running!');
    console.log('🚀 You can now run integration tests with: npm run test:integration');

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