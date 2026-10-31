/**
 * Auto-detect Clerk org/user IDs and run db:seed-demo with identity binding.
 * Run: npx tsx e2e/seed.ts  (or: pnpm e2e:seed)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/* ── Load .env.e2e ───────────────────────────────────────────────── */
const envPath = resolve(root, '.env.e2e');
if (!existsSync(envPath)) {
  console.error('Missing .env.e2e — copy from .env.e2e.example and fill in values.');
  process.exit(1);
}
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 1) continue;
  const key = t.slice(0, eq).trim();
  const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (!process.env[key]) process.env[key] = val;
}

const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
const EMAIL = process.env.E2E_USER_EMAIL;
if (!CLERK_SECRET || !EMAIL) {
  console.error('Set CLERK_SECRET_KEY and E2E_USER_EMAIL in .env.e2e');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${CLERK_SECRET}` };

/* ── 1. Find user by email ───────────────────────────────────────── */
console.log(`[e2e:seed] Looking up Clerk user: ${EMAIL}`);
const usersRes = await fetch(
  `https://api.clerk.com/v1/users?email_address[]=${encodeURIComponent(EMAIL)}`,
  { headers },
);
if (!usersRes.ok) {
  console.error(`Clerk API error ${usersRes.status}: ${await usersRes.text()}`);
  process.exit(1);
}
const users = (await usersRes.json()) as { id: string }[];
if (!users.length) {
  console.error(`No Clerk user found for: ${EMAIL}`);
  process.exit(1);
}
const userId = users[0].id;
console.log(`[e2e:seed] User ID: ${userId}`);

/* ── 2. Get org membership ───────────────────────────────────────── */
const orgsRes = await fetch(
  `https://api.clerk.com/v1/users/${userId}/organization_memberships`,
  { headers },
);
if (!orgsRes.ok) {
  console.error(`Clerk API error ${orgsRes.status}: ${await orgsRes.text()}`);
  process.exit(1);
}
const orgs = (await orgsRes.json()) as {
  data: { organization: { id: string; name: string } }[];
};
if (!orgs.data?.length) {
  console.error(`User ${userId} has no organisation memberships in Clerk.`);
  process.exit(1);
}
const orgId = orgs.data[0].organization.id;
const orgName = orgs.data[0].organization.name;
console.log(`[e2e:seed] Org: ${orgName} (${orgId})`);

/* ── 3. Run seed with Clerk identity binding ─────────────────────── */
console.log('[e2e:seed] Running db:seed-demo with E2E mode (in_review, no WORM)...');
execSync('pnpm --filter @complianceforge/api run db:seed-demo', {
  stdio: 'inherit',
  cwd: root,
  env: {
    ...process.env,
    DEMO_CLERK_ORG_ID: orgId,
    DEMO_CLERK_ADMIN_ID: userId,
    DEMO_CLERK_REVIEWER_ID: userId,
    DEMO_CLERK_LEARNER_ID: userId,
    DEMO_E2E_MODE: 'true',
  },
});

console.log(`[e2e:seed] Done — module seeded as in_review with unresolved findings`);
console.log(`[e2e:seed] Bound to ${EMAIL} / ${orgName}`);
