import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '2m', target: 100 },   // Ramp to 100 users
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.1'],
  },
};

let authToken = '';

export function setup() {
  // Login to get auth token
  const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, JSON.stringify({
    phone: '+1234567890',
    password: 'admin123',
  }), { headers: { 'Content-Type': 'application/json' } });
  
  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    authToken = body.accessToken || '';
  }
  
  return { token: authToken };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  // Test: Health check (no auth)
  const healthRes = http.get(`${BASE_URL}/api/v1/monitoring/health`);
  check(healthRes, { 'health status 200': (r) => r.status === 200 });
  apiLatency.add(healthRes.timings.duration);

  // Test: Dashboard KPIs
  const kpiRes = http.get(`${BASE_URL}/api/v1/dashboard/kpis`, { headers });
  check(kpiRes, { 'KPIs status 200': (r) => r.status === 200 });
  apiLatency.add(kpiRes.timings.duration);

  // Test: Customer list
  const customersRes = http.get(`${BASE_URL}/api/v1/customers?page=1&limit=20`, { headers });
  check(customersRes, { 'customers status 200': (r) => r.status === 200 });
  apiLatency.add(customersRes.timings.duration);

  // Test: NOC Overview
  const nocRes = http.get(`${BASE_URL}/api/v1/noc/overview`, { headers });
  check(nocRes, { 'NOC status 200': (r) => r.status === 200 });
  apiLatency.add(nocRes.timings.duration);

  // Test: Network devices
  const devicesRes = http.get(`${BASE_URL}/api/v1/network/devices`, { headers });
  check(devicesRes, { 'devices status 200': (r) => r.status === 200 });
  apiLatency.add(devicesRes.timings.duration);

  // Test: Financial overview
  const financialRes = http.get(`${BASE_URL}/api/v1/financial/overview`, { headers });
  check(financialRes, { 'financial status 200': (r) => r.status === 200 });
  apiLatency.add(financialRes.timings.duration);

  // Test: Search
  const searchRes = http.get(`${BASE_URL}/api/v1/noc/search?q=test`, { headers });
  check(searchRes, { 'search status 200': (r) => r.status === 200 });
  apiLatency.add(searchRes.timings.duration);

  // Track errors
  const responses = [healthRes, kpiRes, customersRes, nocRes, devicesRes, financialRes, searchRes];
  responses.forEach(res => {
    errorRate.add(res.status >= 400);
  });

  sleep(1);
}

export function teardown(data) {
  console.log('Load test completed');
}
