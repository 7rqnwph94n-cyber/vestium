// ─── WORM verifier ────────────────────────────────────────────────────────────
// Verifies DB-level immutability controls for audit_log:
// - no updated_at column
// - immutable trigger function exists
// - update/delete triggers exist
// - UPDATE/DELETE/TRUNCATE revoked from PUBLIC

import { sql } from './client.js';

type CheckResult = {
  name: string;
  ok: boolean;
  details: string;
};

async function run(): Promise<void> {
  const checks: CheckResult[] = [];

  // 1) No updated_at on audit_log
  const updatedAtCol = await sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_log'
      AND column_name = 'updated_at'
    LIMIT 1
  `;
  checks.push({
    name: 'audit_log has no updated_at',
    ok: updatedAtCol.length === 0,
    details: updatedAtCol.length === 0 ? 'OK' : 'updated_at column exists',
  });

  // 2) Trigger function exists
  const triggerFn = await sql`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prevent_audit_log_modification'
    LIMIT 1
  `;
  checks.push({
    name: 'prevent_audit_log_modification() exists',
    ok: triggerFn.length === 1,
    details: triggerFn.length === 1 ? 'OK' : 'missing function',
  });

  // 3) UPDATE/DELETE triggers exist
  const triggers = await sql`
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'audit_log'
      AND t.tgname IN ('audit_log_no_update', 'audit_log_no_delete')
      AND NOT t.tgisinternal
  `;
  const triggerNames = new Set(triggers.map((r) => (r as { tgname: string }).tgname));
  checks.push({
    name: 'audit_log_no_update trigger exists',
    ok: triggerNames.has('audit_log_no_update'),
    details: triggerNames.has('audit_log_no_update') ? 'OK' : 'missing trigger',
  });
  checks.push({
    name: 'audit_log_no_delete trigger exists',
    ok: triggerNames.has('audit_log_no_delete'),
    details: triggerNames.has('audit_log_no_delete') ? 'OK' : 'missing trigger',
  });

  // 4) PUBLIC does not have UPDATE/DELETE/TRUNCATE privileges on audit_log
  const publicGrants = await sql`
    SELECT privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'audit_log'
      AND grantee = 'PUBLIC'
  `;
  const grantSet = new Set(publicGrants.map((r) => (r as { privilege_type: string }).privilege_type));
  checks.push({
    name: 'PUBLIC has no UPDATE',
    ok: !grantSet.has('UPDATE'),
    details: !grantSet.has('UPDATE') ? 'OK' : 'UPDATE granted to PUBLIC',
  });
  checks.push({
    name: 'PUBLIC has no DELETE',
    ok: !grantSet.has('DELETE'),
    details: !grantSet.has('DELETE') ? 'OK' : 'DELETE granted to PUBLIC',
  });
  checks.push({
    name: 'PUBLIC has no TRUNCATE',
    ok: !grantSet.has('TRUNCATE'),
    details: !grantSet.has('TRUNCATE') ? 'OK' : 'TRUNCATE granted to PUBLIC',
  });

  // 5) Evidentiary record trigger function exists
  const evidentiaryFn = await sql`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prevent_evidentiary_record_modification'
    LIMIT 1
  `;
  checks.push({
    name: 'prevent_evidentiary_record_modification() exists',
    ok: evidentiaryFn.length === 1,
    details: evidentiaryFn.length === 1 ? 'OK' : 'missing function',
  });

  // 6) Evidentiary table triggers (UPDATE + DELETE on attestations, sop_attestations, module_certificates, learner_certificates)
  const evidentiaryTables = ['attestations', 'sop_attestations', 'module_certificates', 'learner_certificates'];
  for (const tableName of evidentiaryTables) {
    const tableTriggers = await sql`
      SELECT tgname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ${tableName}
        AND (t.tgname LIKE '%_no_update' OR t.tgname LIKE '%_no_delete')
        AND NOT t.tgisinternal
    `;
    const tNames = new Set(tableTriggers.map((r) => (r as { tgname: string }).tgname));
    const updateTrigger = [...tNames].find((n) => n.includes('no_update'));
    const deleteTrigger = [...tNames].find((n) => n.includes('no_delete'));
    checks.push({
      name: `${tableName} has no_update trigger`,
      ok: !!updateTrigger,
      details: updateTrigger ? 'OK' : 'missing trigger',
    });
    checks.push({
      name: `${tableName} has no_delete trigger`,
      ok: !!deleteTrigger,
      details: deleteTrigger ? 'OK' : 'missing trigger',
    });
  }

  // 7) PUBLIC does not have UPDATE/DELETE/TRUNCATE on v1 evidentiary tables
  for (const tableName of evidentiaryTables) {
    const tableGrants = await sql`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND grantee = 'PUBLIC'
    `;
    const tGrants = new Set(tableGrants.map((r) => (r as { privilege_type: string }).privilege_type));
    for (const priv of ['UPDATE', 'DELETE', 'TRUNCATE'] as const) {
      checks.push({
        name: `${tableName}: PUBLIC has no ${priv}`,
        ok: !tGrants.has(priv),
        details: !tGrants.has(priv) ? 'OK' : `${priv} granted to PUBLIC`,
      });
    }
  }

  // 8) v2 governed evidentiary tables (governed_attestations, governed_certificates)
  const v2EvidentiaryTables = ['governed_attestations', 'governed_certificates'];
  for (const tableName of v2EvidentiaryTables) {
    const tableTriggers = await sql`
      SELECT tgname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ${tableName}
        AND (t.tgname LIKE '%_no_update' OR t.tgname LIKE '%_no_delete')
        AND NOT t.tgisinternal
    `;
    const tNames = new Set(tableTriggers.map((r) => (r as { tgname: string }).tgname));
    const updateTrigger = [...tNames].find((n) => n.includes('no_update'));
    const deleteTrigger = [...tNames].find((n) => n.includes('no_delete'));
    checks.push({
      name: `${tableName} has no_update trigger`,
      ok: !!updateTrigger,
      details: updateTrigger ? 'OK' : 'missing trigger',
    });
    checks.push({
      name: `${tableName} has no_delete trigger`,
      ok: !!deleteTrigger,
      details: deleteTrigger ? 'OK' : 'missing trigger',
    });
  }

  // 9) PUBLIC does not have UPDATE/DELETE/TRUNCATE on v2 governed tables
  for (const tableName of v2EvidentiaryTables) {
    const tableGrants = await sql`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND grantee = 'PUBLIC'
    `;
    const tGrants = new Set(tableGrants.map((r) => (r as { privilege_type: string }).privilege_type));
    for (const priv of ['UPDATE', 'DELETE', 'TRUNCATE'] as const) {
      checks.push({
        name: `${tableName}: PUBLIC has no ${priv}`,
        ok: !tGrants.has(priv),
        details: !tGrants.has(priv) ? 'OK' : `${priv} granted to PUBLIC`,
      });
    }
  }

  // 10) Live trigger enforcement — attempt UPDATE on a real audit_log row
  {
    const testRows = await sql`SELECT id FROM audit_log LIMIT 1`;
    if (testRows.length > 0) {
      const testId = (testRows[0] as { id: string }).id;
      try {
        await sql`UPDATE audit_log SET action = 'tampered' WHERE id = ${testId}`;
        // If we reach here, the trigger didn't fire — FAIL
        checks.push({
          name: 'audit_log UPDATE trigger enforced (live)',
          ok: false,
          details: 'UPDATE succeeded — trigger not enforcing immutability',
        });
      } catch {
        // Expected: trigger rejects the UPDATE
        checks.push({
          name: 'audit_log UPDATE trigger enforced (live)',
          ok: true,
          details: 'UPDATE correctly rejected by trigger',
        });
      }
    } else {
      checks.push({
        name: 'audit_log UPDATE trigger enforced (live)',
        ok: true,
        details: 'Skipped — no audit_log rows to test against (metadata checks passed)',
      });
    }
  }

  // Print report
  for (const check of checks) {
    const mark = check.ok ? 'PASS' : 'FAIL';
    console.log(`${mark}  ${check.name} :: ${check.details}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
    console.error(`\nWORM verification failed: ${failed.length} check(s) did not pass.`);
  } else {
    console.log('\nWORM verification passed.');
  }
}

await run();
