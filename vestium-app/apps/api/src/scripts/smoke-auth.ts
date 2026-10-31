// Minimal authenticated smoke test for API auth middleware and protected route.
// Requires a valid Clerk session token in CLERK_TEST_TOKEN.

const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
const token = process.env.CLERK_TEST_TOKEN;

if (!token) {
  console.error('CLERK_TEST_TOKEN is required for smoke:auth');
  console.error('Example: CLERK_TEST_TOKEN=... pnpm --filter @complianceforge/api run smoke:auth');
  process.exit(1);
}

if (token === 'your_real_token') {
  console.error('CLERK_TEST_TOKEN is set to placeholder value "your_real_token".');
  console.error('Use an actual Clerk session token.');
  process.exit(1);
}

let healthRes: Response;
try {
  healthRes = await fetch(`${baseUrl}/health`);
} catch (error) {
  console.error(`Could not reach API at ${baseUrl}.`);
  console.error('Start it first: pnpm --filter @complianceforge/api run dev:clean');
  console.error(String(error));
  process.exit(1);
}

if (!healthRes.ok) {
  console.error(`Health check failed: ${healthRes.status} ${healthRes.statusText}`);
  process.exit(1);
}

const protectedRes = await fetch(`${baseUrl}/api/orgs/me`, {
  headers: {
    authorization: `Bearer ${token}`,
  },
});

const body = await protectedRes.text();

if (!protectedRes.ok) {
  console.error(`Authenticated route failed: ${protectedRes.status}`);
  console.error(body);
  process.exit(1);
}

console.log('smoke:auth passed');
console.log(body);
