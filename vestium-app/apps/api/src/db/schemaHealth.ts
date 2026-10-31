import { sql } from './client.js';

type ConstraintRow = {
  table_name: string;
  columns: string[];
};

type RequiredConstraint = {
  table: string;
  columns: string[];
};

const REQUIRED_CONSTRAINTS: RequiredConstraint[] = [
  { table: 'orgs', columns: ['clerk_org_id'] },
  { table: 'generation_jobs', columns: ['module_id'] },
  { table: 'sop_generation_jobs', columns: ['sop_id'] },
  { table: 'attestations', columns: ['module_id'] },
  { table: 'module_certificates', columns: ['module_id'] },
  { table: 'sop_attestations', columns: ['sop_id'] },
];

const formatKey = (table: string, cols: string[]): string => `${table}(${cols.join(',')})`;

export async function verifySchemaHealth(): Promise<{ ok: boolean; missing: string[] }> {
  const rows = await sql`
    SELECT
      t.relname AS table_name,
      array_agg(a.attname ORDER BY x.ord)::text[] AS columns
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(c.conkey) WITH ORDINALITY AS x(attnum, ord) ON TRUE
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
    WHERE n.nspname = 'public'
      AND c.contype IN ('p', 'u')
    GROUP BY t.relname, c.oid
  ` as ConstraintRow[];

  const available = new Set(rows.map((r) => formatKey(r.table_name, r.columns)));
  const missing = REQUIRED_CONSTRAINTS
    .filter((c) => !available.has(formatKey(c.table, c.columns)))
    .map((c) => formatKey(c.table, c.columns));

  return { ok: missing.length === 0, missing };
}

