const autocannon = require('autocannon');
const { promisify } = require('util');

const run = promisify(autocannon);

async function runPerformanceTests() {
  console.log('🚀 Starting Performance Tests...\n');

  // Test 1: Authentication endpoint
  console.log('📊 Testing Authentication Endpoint...');
  const authResult = await run({
    url: 'http://localhost:3000/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'commuter1@example.com',
      password: 'commuterpass'
    }),
    connections: 10,
    duration: 10,
    title: 'Auth Login'
  });

  console.log('✅ Auth Login Results:');
  console.log(`   Requests/sec: ${authResult.requests.average}`);
  console.log(`   Latency (avg): ${authResult.latency.average}ms`);
  console.log(`   Latency (p95): ${authResult.latency.p95}ms`);
  console.log(`   Errors: ${authResult.errors}\n`);

  // Test 2: Routes endpoint (with auth)
  console.log('📊 Testing Routes Endpoint...');
  const routesResult = await run({
    url: 'http://localhost:3000/routes',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJjb21tdXRlcjEiLCJyb2xlIjoiY29tbXV0ZXIiLCJpYXQiOjE2MzY5MzYwMDAsImV4cCI6MTYzNzU0MDgwMH0.test_token'
    },
    connections: 20,
    duration: 15,
    title: 'Get Routes'
  });

  console.log('✅ Routes Results:');
  console.log(`   Requests/sec: ${routesResult.requests.average}`);
  console.log(`   Latency (avg): ${routesResult.latency.average}ms`);
  console.log(`   Latency (p95): ${routesResult.latency.p95}ms`);
  console.log(`   Errors: ${routesResult.errors}\n`);

  // Test 3: Location tracking endpoint
  console.log('📊 Testing Location Tracking Endpoint...');
  const locationResult = await run({
    url: 'http://localhost:3000/locations/trips/TRIP001/location',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJjb21tdXRlcjEiLCJyb2xlIjoiY29tbXV0ZXIiLCJpYXQiOjE2MzY5MzYwMDAsImV4cCI6MTYzNzU0MDgwMH0.test_token'
    },
    connections: 30,
    duration: 20,
    title: 'Get Location'
  });

  console.log('✅ Location Tracking Results:');
  console.log(`   Requests/sec: ${locationResult.requests.average}`);
  console.log(`   Latency (avg): ${locationResult.latency.average}ms`);
  console.log(`   Latency (p95): ${locationResult.latency.p95}ms`);
  console.log(`   Errors: ${locationResult.errors}\n`);

  // Test 4: Mixed workload simulation
  console.log('📊 Testing Mixed Workload...');
  const mixedResult = await run({
    url: 'http://localhost:3000',
    connections: 50,
    duration: 30,
    requests: [
      {
        method: 'POST',
        path: '/auth/login',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'commuter1@example.com',
          password: 'commuterpass'
        })
      },
      {
        method: 'GET',
        path: '/routes',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJjb21tdXRlcjEiLCJyb2xlIjoiY29tbXV0ZXIiLCJpYXQiOjE2MzY5MzYwMDAsImV4cCI6MTYzNzU0MDgwMH0.test_token'
        }
      },
      {
        method: 'GET',
        path: '/trips/routes/1/trips',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJjb21tdXRlcjEiLCJyb2xlIjoiY29tbXV0ZXIiLCJpYXQiOjE2MzY5MzYwMDAsImV4cCI6MTYzNzU0MDgwMH0.test_token'
        }
      }
    ],
    title: 'Mixed Workload'
  });

  console.log('✅ Mixed Workload Results:');
  console.log(`   Requests/sec: ${mixedResult.requests.average}`);
  console.log(`   Latency (avg): ${mixedResult.latency.average}ms`);
  console.log(`   Latency (p95): ${mixedResult.latency.p95}ms`);
  console.log(`   Errors: ${mixedResult.errors}\n`);

  // Performance thresholds check
  console.log('📈 Performance Thresholds Check:');
  const thresholds = {
    authLatency: 200, // ms
    routesLatency: 300, // ms
    locationLatency: 150, // ms
    mixedLatency: 400, // ms
    errorRate: 0.01 // 1%
  };

  const checks = [
    { name: 'Auth Latency', value: authResult.latency.average, threshold: thresholds.authLatency },
    { name: 'Routes Latency', value: routesResult.latency.average, threshold: thresholds.routesLatency },
    { name: 'Location Latency', value: locationResult.latency.average, threshold: thresholds.locationLatency },
    { name: 'Mixed Latency', value: mixedResult.latency.average, threshold: thresholds.mixedLatency },
    { name: 'Error Rate', value: authResult.errors / authResult.requests.total, threshold: thresholds.errorRate }
  ];

  checks.forEach(check => {
    const status = check.value <= check.threshold ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${check.name}: ${check.value.toFixed(2)} ${check.name.includes('Rate') ? '' : 'ms'} - ${status}`);
  });

  console.log('\n🎯 Performance Test Complete!');
}

// Run tests if called directly
if (require.main === module) {
  runPerformanceTests().catch(console.error);
}

module.exports = { runPerformanceTests };