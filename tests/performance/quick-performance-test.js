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
    title: 'Auth Login - Commuter'
  });

  // Test 1b: SLTB Operator Authentication
  console.log('📊 Testing SLTB Operator Authentication...');
  const sltbAuthResult = await run({
    url: 'http://localhost:3000/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'sltb01@sltb.lk',
      password: 'sltb01pass',
      permit_validation: true
    }),
    connections: 10,
    duration: 10,
    title: 'Auth Login - SLTB Operator with Permit Validation'
  });

  console.log('✅ Commuter Auth Results:');
  console.log(`   Requests/sec: ${authResult.requests.average}`);
  console.log(`   Latency (avg): ${authResult.latency.average}ms`);
  console.log(`   Latency (p95): ${authResult.latency.p95}ms`);
  console.log(`   Errors: ${authResult.errors}\n`);

  console.log('✅ SLTB Operator Auth Results:');
  console.log(`   Requests/sec: ${sltbAuthResult.requests.average}`);
  console.log(`   Latency (avg): ${sltbAuthResult.latency.average}ms`);
  console.log(`   Latency (p95): ${sltbAuthResult.latency.p95}ms`);
  console.log(`   Errors: ${sltbAuthResult.errors}\n`);

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

  // Test 2b: Advanced Bus Filtering
  console.log('📊 Testing Advanced Bus Filtering...');
  const busFilterResult = await run({
    url: 'http://localhost:3000/buses?service_type=LU&operator_type=SLTB&capacity_gt=40&capacity_lt=60',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTYzNjkzNjAwMCwiZXhwIjoxNjM3NTQwODAwfQ.test_token'
    },
    connections: 25,
    duration: 15,
    title: 'Advanced Bus Filtering'
  });

  console.log('✅ Bus Filtering Results:');
  console.log(`   Requests/sec: ${busFilterResult.requests.average}`);
  console.log(`   Latency (avg): ${busFilterResult.latency.average}ms`);
  console.log(`   Latency (p95): ${busFilterResult.latency.p95}ms`);
  console.log(`   Errors: ${busFilterResult.errors}\n`);

  // Test 2c: Permit Number Filtering
  console.log('📊 Testing Permit Number Filtering...');
  const permitFilterResult = await run({
    url: 'http://localhost:3000/buses?permit_number_in=NTC-001-2024,NTC-002-2024,NTC-003-2024',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTYzNjkzNjAwMCwiZXhwIjoxNjM3NTQwODAwfQ.test_token'
    },
    connections: 20,
    duration: 12,
    title: 'Permit Filtering'
  });

  console.log('✅ Permit Filtering Results:');
  console.log(`   Requests/sec: ${permitFilterResult.requests.average}`);
  console.log(`   Latency (avg): ${permitFilterResult.latency.average}ms`);
  console.log(`   Latency (p95): ${permitFilterResult.latency.p95}ms`);
  console.log(`   Errors: ${permitFilterResult.errors}\n`);

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

  // Test 4: Mixed workload simulation (NTC-compliant operations)
  console.log('📊 Testing Mixed NTC Workload...');
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
        method: 'POST',
        path: '/auth/login',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'sltb01@sltb.lk',
          password: 'sltb01pass',
          permit_validation: true
        })
      },
      {
        method: 'GET',
        path: '/routes?page=1&limit=10',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJjb21tdXRlcjEiLCJyb2xlIjoiY29tbXV0ZXIiLCJpYXQiOjE2MzY5MzYwMDAsImV4cCI6MTYzNzU0MDgwMH0.test_token'
        }
      },
      {
        method: 'GET',
        path: '/buses?service_type=N&operator_type=SLTB',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJjb21tdXRlcjEiLCJyb2xlIjoiY29tbXV0ZXIiLCJpYXQiOjE2MzY5MzYwMDAsImV4cCI6MTYzNzU0MDgwMH0.test_token'
        }
      },
      {
        method: 'GET',
        path: '/trips/routes/1/trips?direction=outbound',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJjb21tdXRlcjEiLCJyb2xlIjoiY29tbXV0ZXIiLCJpYXQiOjE2MzY5MzYwMDAsImV4cCI6MTYzNzU0MDgwMH0.test_token'
        }
      }
    ],
    title: 'Mixed NTC Workload'
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