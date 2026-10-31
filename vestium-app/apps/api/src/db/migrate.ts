// ─── DB migration runner ──────────────────────────────────────────────────────
// Reads schema.sql and executes it against the Neon database.
// Run with: pnpm --filter @complianceforge/api db:migrate
//
// Safe to re-run — all CREATE statements use IF NOT EXISTS.
// Uses neon() directly (not the shared client) to run raw SQL strings.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
const rawSql = neon(process.env.DATABASE_URL);

// Split on ';' but skip semicolons inside $$ dollar-quoted blocks (plpgsql functions).
// Then strip comment-only lines from each segment so that section headers like
// "-- ─── Modules ──" don't cause the entire CREATE TABLE to be filtered out.
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '$' && sql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++;
    } else if (sql[i] === ';' && !inDollarQuote) {
      // Strip comment-only lines, then keep if non-empty SQL remains
      const stripped = current
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      if (stripped.length > 0) {
        statements.push(stripped);
      }
      current = '';
    } else {
      current += sql[i];
    }
  }

  // Trailing content after last semicolon
  const stripped = current
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
  if (stripped.length > 0) {
    statements.push(stripped);
  }

  return statements;
}

const statements = splitSqlStatements(schema);

console.log(`Running ${statements.length} SQL statements...`);

for (const statement of statements) {
  try {
    await rawSql([statement + ';'] as unknown as TemplateStringsArray);
    process.stdout.write('.');
  } catch (err) {
    console.error(`\nFailed on statement:\n${statement}\n`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\nMigration complete.');
