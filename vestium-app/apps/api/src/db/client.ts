// ─── Neon Postgres client ─────────────────────────────────────────────────────
// Single shared client for all DB operations.
// Uses @neondatabase/serverless which works in both Node.js and edge runtimes.

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = neon(process.env.DATABASE_URL);
