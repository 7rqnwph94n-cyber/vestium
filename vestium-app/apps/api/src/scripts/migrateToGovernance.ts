// ─── v1 → v2 Governance Migration ─────────────────────────────────────────────
// One-time migration script: copies existing module and SOP records into the
// v2 governed content layer (content_registry, governed_findings,
// governed_attestations, governed_certificates).
//
// Old v1 tables remain intact — no data is deleted. The v1 routes continue
// working for historical cert chain verification.
//
// Run with: npx tsx src/scripts/migrateToGovernance.ts

import { sql } from '../db/client.js';

interface MigrationStats {
  registryCreated: number;
  findingsCopied: number;
  attestationsCopied: number;
  certificatesCopied: number;
  skipped: number;
  errors: string[];
}

async function migrateModules(stats: MigrationStats): Promise<void> {
  const modules = await sql`
    SELECT id, org_id, title, status, content_hash
    FROM modules
    ORDER BY created_at ASC
  ` as Array<{ id: string; org_id: string; title: string; status: string; content_hash: string | null }>;

  console.log(`[modules] Found ${modules.length} module(s) to migrate`);

  for (const mod of modules) {
    // Check if already migrated
    const existing = await sql`
      SELECT id FROM content_registry
      WHERE content_type = 'module' AND source_entity_id = ${mod.id}
    `;
    if (existing.length > 0) {
      stats.skipped++;
      continue;
    }

    try {
      // 1. Create content_registry entry
      const [regRow] = await sql`
        INSERT INTO content_registry (content_type, org_id, source_entity_id, title, status, content_hash)
        VALUES ('module', ${mod.org_id}, ${mod.id}, ${mod.title}, ${mod.status}, ${mod.content_hash ?? null})
        RETURNING id
      ` as Array<{ id: string }>;
      const registryId = regRow.id;
      stats.registryCreated++;

      // 2. Copy review_findings → governed_findings
      const findings = await sql`
        SELECT severity, category, description, location, regulatory_ref,
               disposition, disposition_rationale, disposed_by, disposed_at, created_at
        FROM review_findings
        WHERE module_id = ${mod.id}
        ORDER BY created_at ASC
      ` as Array<Record<string, unknown>>;

      for (const f of findings) {
        await sql`
          INSERT INTO governed_findings
            (registry_id, severity, category, description, location, regulatory_ref,
             disposition, disposition_rationale, disposed_by, disposed_at, created_at)
          VALUES (
            ${registryId}, ${f.severity}, ${f.category}, ${f.description}, ${f.location},
            ${f.regulatory_ref ?? null},
            ${f.disposition ?? null}, ${f.disposition_rationale ?? null},
            ${f.disposed_by ?? null}, ${f.disposed_at ?? null},
            ${f.created_at}
          )
        `;
        stats.findingsCopied++;
      }

      // 3. Copy attestations → governed_attestations
      const [att] = await sql`
        SELECT reviewer_user_id, reviewer_name, reviewer_role, basis_of_competence,
               regulatory_frameworks_reviewed, explicit_acceptance, content_hash_at_attestation,
               attested_at
        FROM attestations
        WHERE module_id = ${mod.id}
      ` as Array<Record<string, unknown>>;

      let attestationId: string | null = null;
      if (att) {
        const [attRow] = await sql`
          INSERT INTO governed_attestations
            (registry_id, reviewer_user_id, reviewer_name, reviewer_role, basis_of_competence,
             regulatory_frameworks_reviewed, explicit_acceptance, content_hash_at_attestation, attested_at)
          VALUES (
            ${registryId}, ${att.reviewer_user_id}, ${att.reviewer_name}, ${att.reviewer_role},
            ${att.basis_of_competence}, ${att.regulatory_frameworks_reviewed},
            ${att.explicit_acceptance}, ${att.content_hash_at_attestation}, ${att.attested_at}
          )
          ON CONFLICT (registry_id) DO NOTHING
          RETURNING id
        ` as Array<{ id: string }>;
        if (attRow) {
          attestationId = attRow.id;
          stats.attestationsCopied++;
        }
      }

      // 4. Copy module_certificates → governed_certificates
      if (attestationId) {
        const [cert] = await sql`
          SELECT org_id, cert_number, content_hash, source_doc_versions, regulatory_schemas,
                 module_title, reviewer_name, reviewer_role, issued_at
          FROM module_certificates
          WHERE module_id = ${mod.id}
        ` as Array<Record<string, unknown>>;

        if (cert) {
          await sql`
            INSERT INTO governed_certificates
              (registry_id, attestation_id, org_id, cert_number, content_hash,
               source_doc_versions, regulatory_schemas, content_title, reviewer_name, reviewer_role, issued_at)
            VALUES (
              ${registryId}, ${attestationId}, ${cert.org_id},
              ${'G-' + (cert.cert_number as string)},
              ${cert.content_hash}, ${JSON.stringify(cert.source_doc_versions)},
              ${cert.regulatory_schemas}, ${cert.module_title},
              ${cert.reviewer_name}, ${cert.reviewer_role}, ${cert.issued_at}
            )
            ON CONFLICT (registry_id) DO NOTHING
          `;
          stats.certificatesCopied++;
        }
      }
    } catch (err) {
      stats.errors.push(`module ${mod.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function migrateSops(stats: MigrationStats): Promise<void> {
  const sops = await sql`
    SELECT id, org_id, title, status, content_hash
    FROM sop_records
    ORDER BY created_at ASC
  ` as Array<{ id: string; org_id: string; title: string; status: string; content_hash: string | null }>;

  console.log(`[sops] Found ${sops.length} SOP(s) to migrate`);

  for (const sop of sops) {
    const existing = await sql`
      SELECT id FROM content_registry
      WHERE content_type = 'sop' AND source_entity_id = ${sop.id}
    `;
    if (existing.length > 0) {
      stats.skipped++;
      continue;
    }

    try {
      // 1. Create content_registry entry
      const [regRow] = await sql`
        INSERT INTO content_registry (content_type, org_id, source_entity_id, title, status, content_hash)
        VALUES ('sop', ${sop.org_id}, ${sop.id}, ${sop.title}, ${sop.status}, ${sop.content_hash ?? null})
        RETURNING id
      ` as Array<{ id: string }>;
      const registryId = regRow.id;
      stats.registryCreated++;

      // 2. Copy sop_review_findings → governed_findings
      const findings = await sql`
        SELECT severity, category, description, location, regulatory_ref, source_attribution,
               disposition, disposition_rationale, disposed_by, disposed_at, created_at
        FROM sop_review_findings
        WHERE sop_id = ${sop.id}
        ORDER BY created_at ASC
      ` as Array<Record<string, unknown>>;

      for (const f of findings) {
        await sql`
          INSERT INTO governed_findings
            (registry_id, severity, category, description, location, regulatory_ref,
             source_attribution, disposition, disposition_rationale, disposed_by, disposed_at, created_at)
          VALUES (
            ${registryId}, ${f.severity}, ${f.category}, ${f.description}, ${f.location},
            ${f.regulatory_ref ?? null}, ${f.source_attribution ?? null},
            ${f.disposition ?? null}, ${f.disposition_rationale ?? null},
            ${f.disposed_by ?? null}, ${f.disposed_at ?? null},
            ${f.created_at}
          )
        `;
        stats.findingsCopied++;
      }

      // 3. Copy sop_attestations → governed_attestations
      const [att] = await sql`
        SELECT reviewer_user_id, reviewer_name, reviewer_role, basis_of_competence,
               regulatory_frameworks_reviewed, explicit_acceptance, content_hash_at_attestation,
               attested_at
        FROM sop_attestations
        WHERE sop_id = ${sop.id}
      ` as Array<Record<string, unknown>>;

      if (att) {
        await sql`
          INSERT INTO governed_attestations
            (registry_id, reviewer_user_id, reviewer_name, reviewer_role, basis_of_competence,
             regulatory_frameworks_reviewed, explicit_acceptance, content_hash_at_attestation, attested_at)
          VALUES (
            ${registryId}, ${att.reviewer_user_id}, ${att.reviewer_name}, ${att.reviewer_role},
            ${att.basis_of_competence}, ${att.regulatory_frameworks_reviewed},
            ${att.explicit_acceptance}, ${att.content_hash_at_attestation}, ${att.attested_at}
          )
          ON CONFLICT (registry_id) DO NOTHING
        `;
        stats.attestationsCopied++;
      }

      // SOPs don't have certificates in v1 — nothing to copy
    } catch (err) {
      stats.errors.push(`sop ${sop.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function run(): Promise<void> {
  console.log('═══ v1 → v2 Governance Migration ═══\n');

  const stats: MigrationStats = {
    registryCreated: 0,
    findingsCopied: 0,
    attestationsCopied: 0,
    certificatesCopied: 0,
    skipped: 0,
    errors: [],
  };

  await migrateModules(stats);
  await migrateSops(stats);

  console.log('\n═══ Migration Complete ═══');
  console.log(`  Registry entries created: ${stats.registryCreated}`);
  console.log(`  Findings copied:          ${stats.findingsCopied}`);
  console.log(`  Attestations copied:      ${stats.attestationsCopied}`);
  console.log(`  Certificates copied:      ${stats.certificatesCopied}`);
  console.log(`  Skipped (already exist):  ${stats.skipped}`);

  if (stats.errors.length > 0) {
    console.error(`\n  Errors (${stats.errors.length}):`);
    for (const e of stats.errors) {
      console.error(`    - ${e}`);
    }
    process.exitCode = 1;
  }
}

await run();
