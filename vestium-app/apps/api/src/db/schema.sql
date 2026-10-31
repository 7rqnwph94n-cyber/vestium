-- ─── Vestium Database Schema ─────────────────────────────────────────────────
-- PostgreSQL (Neon)
-- Run this via: pnpm --filter @complianceforge/api db:migrate
-- or directly in the Neon SQL console.
--
-- WORM enforcement: audit_log has no UPDATE/DELETE grants for the application user.
-- This is set at the DB level — not enforced in application code alone.

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Orgs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orgs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  clerk_org_id  TEXT        UNIQUE NOT NULL,
  tier          INTEGER     NOT NULL DEFAULT 1 CHECK (tier IN (1, 2)),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS industry              TEXT;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS workforce_size        TEXT;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS onboarding_completed  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- ─── Org Members ─────────────────────────────────────────────────────────────
-- Local member directory synced from Clerk. Stores extended data (job title,
-- department, status) that Clerk metadata cannot represent.
-- Lazy-synced on first API access. Explicit sync via POST /api/members/sync.
CREATE TABLE IF NOT EXISTS org_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  clerk_user_id   TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'learner'
                              CHECK (role IN ('admin','hr_manager','reviewer','learner')),
  job_title       TEXT,
  department      TEXT,
  status          TEXT        NOT NULL DEFAULT 'invited'
                              CHECK (status IN ('active','invited','suspended')),
  invited_at      TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS org_members_org_id_idx     ON org_members(org_id);
CREATE INDEX IF NOT EXISTS org_members_clerk_user_idx ON org_members(clerk_user_id);
CREATE INDEX IF NOT EXISTS org_members_email_idx      ON org_members(email);

-- ─── Modules ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  title                    TEXT        NOT NULL,
  status                   TEXT        NOT NULL DEFAULT 'draft'
                                       CHECK (status IN ('draft', 'in_review', 'deployed', 'stale')),
  workplace_context        JSONB       NOT NULL,
  regulatory_classification JSONB      NOT NULL,
  generation_metadata      JSONB       NOT NULL DEFAULT '{}',
  content_hash             TEXT,                   -- set at deployment (SHA-256 of module content)
  deployed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS modules_org_id_idx ON modules(org_id);
CREATE INDEX IF NOT EXISTS modules_status_idx ON modules(status);

-- ─── Audit Log (WORM) ─────────────────────────────────────────────────────────
-- No updated_at. No UPDATE/DELETE grants for application_user.
-- Every platform action touching a module is logged here.
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  module_id   UUID,       -- soft reference, no FK: audit records outlive the module
  user_id     TEXT        NOT NULL,   -- Clerk user ID
  action      TEXT        NOT NULL,   -- see AuditAction in @complianceforge/types
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at — this is intentional WORM design
);

CREATE INDEX IF NOT EXISTS audit_log_org_id_idx    ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS audit_log_module_id_idx ON audit_log(module_id);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx    ON audit_log(action);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_role TEXT;

-- ─── WORM enforcement ─────────────────────────────────────────────────────────
-- Replace 'application_user' with the actual Neon DB role name.
-- Run after CREATE TABLE as a superuser or owner.
--
-- REVOKE UPDATE, DELETE ON audit_log FROM application_user;
-- Baseline hardening for all roles:
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
--
-- Additionally, a trigger prevents UPDATE/DELETE at DB level regardless of grants:
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable: UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE OR REPLACE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- ─── Attestations ─────────────────────────────────────────────────────────────
-- Locked at creation. No update mechanism. Part of the certificate chain.
CREATE TABLE IF NOT EXISTS attestations (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id                       UUID        NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  reviewer_user_id                TEXT        NOT NULL,   -- Clerk user ID
  reviewer_name                   TEXT        NOT NULL,
  reviewer_role                   TEXT        NOT NULL,
  basis_of_competence             TEXT        NOT NULL,
  regulatory_frameworks_reviewed  TEXT[]      NOT NULL,
  explicit_acceptance             TEXT        NOT NULL,   -- verbatim declaration
  content_hash_at_attestation     TEXT        NOT NULL,   -- hash of module content at time of attestation
  attested_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at — attestations are immutable
);

CREATE INDEX IF NOT EXISTS attestations_module_id_idx      ON attestations(module_id);
CREATE UNIQUE INDEX IF NOT EXISTS attestations_module_id_uidx ON attestations(module_id);

-- Link attestation to the exact snapshot version it signed off on (nullable for pre-existing rows)
ALTER TABLE attestations ADD COLUMN IF NOT EXISTS snapshot_version INTEGER;

-- ─── Source Documents (regulatory source registry) ────────────────────────────
CREATE TABLE IF NOT EXISTS source_documents (
  id              TEXT        PRIMARY KEY,   -- e.g. 'MHSWR-SI', 'L21-ACOP'
  schema_id       TEXT        NOT NULL,      -- e.g. 'mhswr-1999'
  title           TEXT        NOT NULL,
  url             TEXT        NOT NULL,
  publisher       TEXT        NOT NULL,
  doc_type        TEXT        NOT NULL,      -- 'si' | 'acop' | 'guidance' | 'primary_legislation'
  year            INTEGER     NOT NULL,
  version         TEXT,
  effective_date  DATE,
  is_current      BOOLEAN     NOT NULL DEFAULT true,
  superseded_by   TEXT        REFERENCES source_documents(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Review Findings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_findings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id               UUID        NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  severity                TEXT        NOT NULL CHECK (severity IN ('regulatory', 'high', 'medium', 'low')),
  category                TEXT        NOT NULL CHECK (category IN ('A', 'B')),
  description             TEXT        NOT NULL,
  location                TEXT        NOT NULL,
  regulatory_ref          TEXT,
  disposition             TEXT        CHECK (disposition IN ('accepted', 'amended', 'escalated')),
  disposition_rationale   TEXT,
  disposed_by             TEXT,       -- Clerk user ID
  disposed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_findings_module_id_idx ON review_findings(module_id);
CREATE INDEX IF NOT EXISTS review_findings_severity_idx  ON review_findings(severity);

-- ─── Module Certificates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS module_certificates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id           UUID        NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  attestation_id      UUID        NOT NULL REFERENCES attestations(id) ON DELETE RESTRICT,
  org_id              UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  cert_number         TEXT        NOT NULL UNIQUE,
  content_hash        TEXT        NOT NULL,
  source_doc_versions JSONB       NOT NULL DEFAULT '{}',
  regulatory_schemas  TEXT[]      NOT NULL DEFAULT '{}',
  module_title        TEXT        NOT NULL,
  reviewer_name       TEXT        NOT NULL,
  reviewer_role       TEXT        NOT NULL,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_certs_module_id_idx           ON module_certificates(module_id);
CREATE INDEX IF NOT EXISTS module_certs_org_id_idx              ON module_certificates(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS module_certs_cert_num_idx     ON module_certificates(cert_number);
CREATE UNIQUE INDEX IF NOT EXISTS module_certs_module_id_uidx   ON module_certificates(module_id);

-- ─── Learner Certificates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_certificates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_cert_id  UUID        NOT NULL REFERENCES module_certificates(id) ON DELETE RESTRICT,
  module_id       UUID        NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  org_id          UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  cert_number     TEXT        NOT NULL UNIQUE,
  learner_name    TEXT        NOT NULL,
  learner_user_id TEXT        NOT NULL,
  score           INTEGER     NOT NULL,
  pass_threshold  INTEGER     NOT NULL,
  passed          BOOLEAN     NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learner_certs_module_id_idx       ON learner_certificates(module_id);
CREATE INDEX IF NOT EXISTS learner_certs_user_id_idx         ON learner_certificates(learner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS learner_certs_cert_num_idx ON learner_certificates(cert_number);

-- ─── Learner Progress ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_progress (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     UUID        NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  org_id        UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  user_id       TEXT        NOT NULL,
  progress      JSONB       NOT NULL DEFAULT '{}',
  score         INTEGER,
  completed     BOOLEAN     NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS learner_progress_module_user ON learner_progress(module_id, user_id);
CREATE INDEX IF NOT EXISTS learner_progress_org_id_idx         ON learner_progress(org_id);

-- ─── Proxy Asset Library ──────────────────────────────────────────────────────
-- Global (not org-scoped) registry of vetted ISO 7010 + IEC 60417 safety symbols.
-- ISO 7010 symbols are Crown Copyright under OGL v3.0 — attribution is mandatory.
-- IEC 60417 symbols have a commercial licence: DB metadata only, no SVG embedding.
-- Seeded once via: pnpm --filter @complianceforge/api run db:seed-assets
CREATE TABLE IF NOT EXISTS proxy_assets (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_code  TEXT    NOT NULL,   -- e.g. 'W017', 'M009', '5021'
  standard     TEXT    NOT NULL    -- 'iso7010' | 'iec60417'
               CHECK (standard IN ('iso7010', 'iec60417')),
  category     TEXT    NOT NULL    -- sign type
               CHECK (category IN ('warning', 'mandatory', 'prohibition',
                                   'safe-condition', 'fire', 'equipment')),
  description  TEXT    NOT NULL,   -- 'Electrical hazard'
  tags         TEXT[]  NOT NULL DEFAULT '{}',   -- ['electrical', 'voltage', 'arc-flash']
  schema_refs  TEXT[]  NOT NULL DEFAULT '{}',   -- regulatory schema IDs
  svg_path     TEXT,               -- 'iso7010/W017.svg' — null until OGL file is sourced
  licence      TEXT    NOT NULL DEFAULT 'ogl-v3',
  attribution  TEXT    NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol_code, standard)
);
CREATE INDEX IF NOT EXISTS proxy_assets_tags_idx     ON proxy_assets USING GIN(tags);
CREATE INDEX IF NOT EXISTS proxy_assets_schemas_idx  ON proxy_assets USING GIN(schema_refs);
CREATE INDEX IF NOT EXISTS proxy_assets_category_idx ON proxy_assets(category);
CREATE INDEX IF NOT EXISTS proxy_assets_standard_idx ON proxy_assets(standard);

-- ─── Org Contexts ────────────────────────────────────────────────────────────
-- One row per org. Stores the authoritative workplace context (captured on first
-- module creation) and distilled intelligence from all deployed modules.
-- distilled_context holds covered topics, reviewer corrections, domain insights.
CREATE TABLE IF NOT EXISTS org_contexts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  workplace_context JSONB NOT NULL,
  distilled_context JSONB NOT NULL DEFAULT '{}',
  modules_deployed  INTEGER NOT NULL DEFAULT 0,
  last_distilled_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_contexts_org_id_uidx ON org_contexts(org_id);

-- ─── Generation Jobs ──────────────────────────────────────────────────────────
-- Stores full pipeline state so jobs are resumable and frontend can poll steps.
-- One row per module_id (upserted on each step completion).
CREATE TABLE IF NOT EXISTS generation_jobs (
  module_id     UUID        PRIMARY KEY REFERENCES modules(id) ON DELETE RESTRICT,
  org_id        UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  user_id       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'complete', 'failed')),
  job_state     JSONB       NOT NULL DEFAULT '{}',  -- full GenerationJob serialised
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Verbal Responses ─────────────────────────────────────────────────────────
-- Four-layer evidence chain: audio → transcript (Whisper) → attribution (Claude) → manager disposition.
-- Pilot: audio_data is bytea in DB. Production: migrate to R2/S3 via blob_key.
-- Non-response (answered=false) auto-creates a review_finding at Cat A / high severity.
CREATE TABLE IF NOT EXISTS verbal_responses (
  id                         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id                  TEXT         NOT NULL,
  lesson_id                  TEXT         NOT NULL,
  question_id                TEXT         NOT NULL,
  question_prompt            TEXT         NOT NULL,
  regulatory_ref             TEXT,
  timer_seconds              INTEGER      NOT NULL,
  learner_user_id            TEXT         NOT NULL,
  org_id                     UUID         NOT NULL REFERENCES orgs(id),
  audio_data                 BYTEA,
  audio_mime_type            TEXT         NOT NULL DEFAULT 'audio/webm',
  duration_ms                INTEGER,
  answered                   BOOLEAN      NOT NULL DEFAULT TRUE,
  blob_key                   TEXT,        -- 'internal:{id}' until R2/S3 migration
  transcript                 TEXT,
  transcript_model           TEXT,
  transcribed_at             TIMESTAMPTZ,
  attribution_confidence     NUMERIC(4,3),
  attribution_reasoning      TEXT,
  attribution_contradictions TEXT[],
  attributed_at              TIMESTAMPTZ,
  manager_disposition        TEXT         NOT NULL DEFAULT 'pending'
                             CHECK (manager_disposition IN ('confirmed', 'flagged', 'pending')),
  manager_user_id            TEXT,
  manager_note               TEXT,
  reviewed_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS verbal_responses_module_id_idx ON verbal_responses(module_id);
CREATE INDEX IF NOT EXISTS verbal_responses_learner_idx   ON verbal_responses(learner_user_id);
CREATE INDEX IF NOT EXISTS verbal_responses_pending_idx   ON verbal_responses(manager_disposition, org_id)
  WHERE manager_disposition = 'pending';

-- ─── pgvector extension ────────────────────────────────────────────────────────
-- Required for document_chunks semantic search (RAG pipeline).
-- Neon supports pgvector natively — no separate install needed.
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Document Chunks (RAG source material) ────────────────────────────────────
-- Stores chunked + embedded content from source regulatory documents.
-- Embeddings are gemini-embedding-001 with outputDimensionality=768 (Neon index cap is 2000).
-- Used by domainSurvey and factCheck steps to ground generation in real source text.
CREATE TABLE IF NOT EXISTS document_chunks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_doc_id  TEXT        NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  chunk_index    INTEGER     NOT NULL,   -- 0-based position within the document
  content        TEXT        NOT NULL,   -- raw chunk text (max ~800 tokens)
  embedding      vector(768),            -- gemini-embedding-001 truncated to 768 dims
  token_count    INTEGER,
  section_label  TEXT,                   -- e.g. 'Regulation 3', 'Schedule 1 Part II'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrate embedding column if previously created with a different dimension.
-- Safe to run — drops and recreates the index then ALTERs the column type.
DROP INDEX IF EXISTS document_chunks_embedding_idx;
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX IF NOT EXISTS document_chunks_source_doc_idx ON document_chunks(source_doc_id);
-- IVFFlat index for ANN search (requires ~1000 rows to be effective — safe to add to empty table)
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ─── Module Generation Metrics ────────────────────────────────────────────────
-- Per-module, per-step telemetry for pipeline performance monitoring.
-- One row per (module_id, step_key) attempt. Append-only.
CREATE TABLE IF NOT EXISTS module_generation_metrics (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id      UUID        NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  org_id         UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  step_key       TEXT        NOT NULL,   -- 'domainSurvey', 'blueprint', 'stage_1', etc.
  provider       TEXT        NOT NULL,   -- 'anthropic' | 'gemini'
  model          TEXT        NOT NULL,
  attempt        INTEGER     NOT NULL DEFAULT 1,
  status         TEXT        NOT NULL CHECK (status IN ('done', 'error')),
  input_tokens   INTEGER     NOT NULL DEFAULT 0,
  output_tokens  INTEGER     NOT NULL DEFAULT 0,
  duration_ms    INTEGER,
  search_grounded BOOLEAN    NOT NULL DEFAULT false,  -- true if Gemini search grounding was used
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gen_metrics_module_id_idx ON module_generation_metrics(module_id);
CREATE INDEX IF NOT EXISTS gen_metrics_step_key_idx  ON module_generation_metrics(step_key);
CREATE INDEX IF NOT EXISTS gen_metrics_org_id_idx    ON module_generation_metrics(org_id);

-- ─── Constraint migrations ─────────────────────────────────────────────────────
-- These ALTER TABLE statements are idempotent fixups applied on every migrate run.
-- They correct FK behaviours that cannot be changed via CREATE TABLE IF NOT EXISTS.

-- audit_log.module_id: drop FK entirely. Audit records are permanent (WORM) and must
-- survive the module lifecycle — a FK would either block or cascade into an immutable table.
-- module_id is now a soft reference (plain UUID, no constraint).
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_module_id_fkey;

-- ─── SOP Records ──────────────────────────────────────────────────────────────
-- Standard Operating Procedures, optionally paired with a training module.
-- module_id is nullable — standalone SOPs have no parent module.
CREATE TABLE IF NOT EXISTS sop_records (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  module_id                 UUID        REFERENCES modules(id) ON DELETE RESTRICT,
  title                     TEXT        NOT NULL,
  procedure_name            TEXT        NOT NULL,
  equipment                 TEXT        NOT NULL,
  status                    TEXT        NOT NULL DEFAULT 'draft'
                                        CHECK (status IN ('draft','in_review','deployed','stale')),
  workplace_context         JSONB       NOT NULL DEFAULT '{}',
  regulatory_classification JSONB       NOT NULL DEFAULT '{}',
  generation_metadata       JSONB       NOT NULL DEFAULT '{}',
  content_hash              TEXT,
  deployed_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sop_records_org_id_idx    ON sop_records(org_id);
CREATE INDEX IF NOT EXISTS sop_records_module_id_idx ON sop_records(module_id);
CREATE INDEX IF NOT EXISTS sop_records_status_idx    ON sop_records(status);

-- ─── SOP Source Documents ─────────────────────────────────────────────────────
-- Operator manuals, maintenance schedules, COSHH data sheets, risk assessments
-- uploaded by the operator. Text is extracted server-side (pdf-parse).
-- Every procedural claim in the generated SOP must trace to one of these docs.
CREATE TABLE IF NOT EXISTS sop_source_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id      UUID        NOT NULL REFERENCES sop_records(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  doc_type    TEXT        NOT NULL
              CHECK (doc_type IN ('operator_manual','maintenance_schedule','risk_assessment','coshh_datasheet','other')),
  content     TEXT        NOT NULL,
  page_count  INTEGER,
  file_size   INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sop_source_docs_sop_id_idx ON sop_source_documents(sop_id);

-- ─── SOP Generation Jobs ──────────────────────────────────────────────────────
-- Pipeline state for SOP generation (4 sequential steps).
-- Mirrors generation_jobs pattern — full job state in JSONB for resume support.
CREATE TABLE IF NOT EXISTS sop_generation_jobs (
  sop_id        UUID        PRIMARY KEY REFERENCES sop_records(id) ON DELETE CASCADE,
  org_id        UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  user_id       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running','complete','failed')),
  job_state     JSONB       NOT NULL DEFAULT '{}',
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── SOP Review Findings ──────────────────────────────────────────────────────
-- Parallel to review_findings but scoped to SOPs.
-- Cat A auto-seeded for every procedural step that cannot be attributed
-- to an uploaded source document.
CREATE TABLE IF NOT EXISTS sop_review_findings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id                UUID        NOT NULL REFERENCES sop_records(id) ON DELETE RESTRICT,
  severity              TEXT        NOT NULL CHECK (severity IN ('regulatory','high','medium','low')),
  category              TEXT        NOT NULL CHECK (category IN ('A','B')),
  description           TEXT        NOT NULL,
  location              TEXT        NOT NULL,
  regulatory_ref        TEXT,
  source_attribution    TEXT,
  disposition           TEXT        CHECK (disposition IN ('accepted','amended','escalated')),
  disposition_rationale TEXT,
  disposed_by           TEXT,
  disposed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sop_findings_sop_id_idx ON sop_review_findings(sop_id);

-- ─── SOP Attestations ─────────────────────────────────────────────────────────
-- Write-once legal record. Reviewer may differ from module attestation reviewer
-- (e.g. maintenance supervisor attests SOP, H&S manager attests module).
CREATE TABLE IF NOT EXISTS sop_attestations (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id                          UUID        NOT NULL REFERENCES sop_records(id) ON DELETE RESTRICT,
  reviewer_user_id                TEXT        NOT NULL,
  reviewer_name                   TEXT        NOT NULL,
  reviewer_role                   TEXT        NOT NULL,
  basis_of_competence             TEXT        NOT NULL,
  regulatory_frameworks_reviewed  TEXT[]      NOT NULL,
  explicit_acceptance             TEXT        NOT NULL,
  content_hash_at_attestation     TEXT        NOT NULL,
  attested_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sop_attestations_sop_id_uidx ON sop_attestations(sop_id);

-- ─── Evidentiary record immutability ─────────────────────────────────────────
-- Attestations and certificates are legal artefacts in the certificate chain.
-- Same WORM pattern as audit_log: trigger-locked + permission-revoked.
CREATE OR REPLACE FUNCTION prevent_evidentiary_record_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is immutable: UPDATE and DELETE are not permitted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Attestations (module)
CREATE OR REPLACE TRIGGER attestations_no_update
  BEFORE UPDATE ON attestations FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
CREATE OR REPLACE TRIGGER attestations_no_delete
  BEFORE DELETE ON attestations FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
REVOKE UPDATE, DELETE, TRUNCATE ON attestations FROM PUBLIC;

-- Attestations (SOP)
CREATE OR REPLACE TRIGGER sop_attestations_no_update
  BEFORE UPDATE ON sop_attestations FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
CREATE OR REPLACE TRIGGER sop_attestations_no_delete
  BEFORE DELETE ON sop_attestations FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
REVOKE UPDATE, DELETE, TRUNCATE ON sop_attestations FROM PUBLIC;

-- Module Certificates
CREATE OR REPLACE TRIGGER module_certs_no_update
  BEFORE UPDATE ON module_certificates FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
CREATE OR REPLACE TRIGGER module_certs_no_delete
  BEFORE DELETE ON module_certificates FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
REVOKE UPDATE, DELETE, TRUNCATE ON module_certificates FROM PUBLIC;

-- Learner Certificates
CREATE OR REPLACE TRIGGER learner_certs_no_update
  BEFORE UPDATE ON learner_certificates FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
CREATE OR REPLACE TRIGGER learner_certs_no_delete
  BEFORE DELETE ON learner_certificates FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
REVOKE UPDATE, DELETE, TRUNCATE ON learner_certificates FROM PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- v2: GENERIC GOVERNANCE LAYER
-- ═══════════════════════════════════════════════════════════════════════════════
-- The content_registry indexes all governed content (modules, SOPs, RAMS, permits,
-- toolbox talks, QR packs). Governance tables (findings, attestations, certificates)
-- reference content_registry.id instead of per-type FKs. Per-type domain tables
-- (modules, sop_records, rams_records, etc.) remain for schema flexibility.

-- ─── Content Registry ────────────────────────────────────────────────────────
-- Universal index of all governed content items. Acts as FK target for the
-- generic governance tables. source_entity_id is a soft reference (no FK) to
-- the per-type table PK.
CREATE TABLE IF NOT EXISTS content_registry (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type     TEXT        NOT NULL
                               CHECK (content_type IN ('module','sop','rams','permit','toolbox_talk','qr_pack')),
  org_id           UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  title            TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','in_review','deployed','stale')),
  content_hash     TEXT,
  source_entity_id UUID        NOT NULL,
  deployed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_registry_entity_uidx ON content_registry(content_type, source_entity_id);
CREATE INDEX IF NOT EXISTS content_registry_org_id_idx  ON content_registry(org_id);
CREATE INDEX IF NOT EXISTS content_registry_type_idx    ON content_registry(content_type);
CREATE INDEX IF NOT EXISTS content_registry_status_idx  ON content_registry(status);

-- ─── Governed Findings ──────────────────────────────────────────────────────
-- Unified review findings for all content types. Superset of review_findings +
-- sop_review_findings. source_attribution is nullable (used by SOPs/RAMS only).
CREATE TABLE IF NOT EXISTS governed_findings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id           UUID        NOT NULL REFERENCES content_registry(id) ON DELETE RESTRICT,
  severity              TEXT        NOT NULL CHECK (severity IN ('regulatory','high','medium','low')),
  category              TEXT        NOT NULL CHECK (category IN ('A','B')),
  description           TEXT        NOT NULL,
  location              TEXT        NOT NULL,
  regulatory_ref        TEXT,
  source_attribution    TEXT,
  disposition           TEXT        CHECK (disposition IN ('accepted','amended','escalated')),
  disposition_rationale TEXT,
  disposed_by           TEXT,
  disposed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS governed_findings_registry_id_idx ON governed_findings(registry_id);
CREATE INDEX IF NOT EXISTS governed_findings_severity_idx    ON governed_findings(severity);

-- ─── Governed Attestations ──────────────────────────────────────────────────
-- Immutable legal attestation records for any content type.
-- WORM-protected: trigger-locked + permission-revoked.
CREATE TABLE IF NOT EXISTS governed_attestations (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id                     UUID        NOT NULL REFERENCES content_registry(id) ON DELETE RESTRICT,
  reviewer_user_id                TEXT        NOT NULL,
  reviewer_name                   TEXT        NOT NULL,
  reviewer_role                   TEXT        NOT NULL,
  basis_of_competence             TEXT        NOT NULL,
  regulatory_frameworks_reviewed  TEXT[]      NOT NULL,
  explicit_acceptance             TEXT        NOT NULL,
  content_hash_at_attestation     TEXT        NOT NULL,
  attested_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS governed_attestations_registry_uidx ON governed_attestations(registry_id);

-- WORM enforcement
CREATE OR REPLACE TRIGGER governed_attestations_no_update
  BEFORE UPDATE ON governed_attestations FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
CREATE OR REPLACE TRIGGER governed_attestations_no_delete
  BEFORE DELETE ON governed_attestations FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
REVOKE UPDATE, DELETE, TRUNCATE ON governed_attestations FROM PUBLIC;

-- ─── Governed Certificates ──────────────────────────────────────────────────
-- Universal content certificates. learner_certificates stays separate
-- (learner-specific, not content governance).
CREATE TABLE IF NOT EXISTS governed_certificates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id         UUID        NOT NULL REFERENCES content_registry(id) ON DELETE RESTRICT,
  attestation_id      UUID        NOT NULL REFERENCES governed_attestations(id) ON DELETE RESTRICT,
  org_id              UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  cert_number         TEXT        NOT NULL UNIQUE,
  content_hash        TEXT        NOT NULL,
  source_doc_versions JSONB       NOT NULL DEFAULT '{}',
  regulatory_schemas  TEXT[]      NOT NULL DEFAULT '{}',
  content_title       TEXT        NOT NULL,
  reviewer_name       TEXT        NOT NULL,
  reviewer_role       TEXT        NOT NULL,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS governed_certs_registry_uidx   ON governed_certificates(registry_id);
CREATE INDEX IF NOT EXISTS governed_certs_org_id_idx             ON governed_certificates(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS governed_certs_cert_num_uidx   ON governed_certificates(cert_number);

-- WORM enforcement
CREATE OR REPLACE TRIGGER governed_certs_no_update
  BEFORE UPDATE ON governed_certificates FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
CREATE OR REPLACE TRIGGER governed_certs_no_delete
  BEFORE DELETE ON governed_certificates FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
REVOKE UPDATE, DELETE, TRUNCATE ON governed_certificates FROM PUBLIC;

-- ─── Content Generation Jobs ────────────────────────────────────────────────
-- Unified pipeline state for all content types. Existing generation_jobs +
-- sop_generation_jobs continue working for v1 types. New types use this table.
CREATE TABLE IF NOT EXISTS content_generation_jobs (
  registry_id   UUID        PRIMARY KEY REFERENCES content_registry(id) ON DELETE CASCADE,
  org_id        UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  user_id       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running','complete','failed')),
  job_state     JSONB       NOT NULL DEFAULT '{}',
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Audit log: add registry_id for v2 governance ───────────────────────────
-- Soft reference (no FK). Existing module_id stays for backward compat.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS registry_id UUID;
CREATE INDEX IF NOT EXISTS audit_log_registry_id_idx ON audit_log(registry_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- RAMS/SSOW (Phase 2)
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── RAMS Records ───────────────────────────────────────────────────────────
-- Domain table for Risk Assessment & Method Statement records.
-- Follows sop_records pattern but with RAMS-specific fields.
CREATE TABLE IF NOT EXISTS rams_records (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID        NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  title                     TEXT        NOT NULL,
  task_description          TEXT        NOT NULL,
  location                  TEXT        NOT NULL DEFAULT '',
  equipment                 TEXT[]      NOT NULL DEFAULT '{}',
  status                    TEXT        NOT NULL DEFAULT 'draft'
                                        CHECK (status IN ('draft','in_review','deployed','stale')),
  workplace_context         JSONB       NOT NULL DEFAULT '{}',
  regulatory_classification JSONB       NOT NULL DEFAULT '{}',
  generation_metadata       JSONB       NOT NULL DEFAULT '{}',
  content_hash              TEXT,
  deployed_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rams_records_org_id_idx  ON rams_records(org_id);
CREATE INDEX IF NOT EXISTS rams_records_status_idx  ON rams_records(status);

-- ─── RAMS Source Documents ──────────────────────────────────────────────────
-- Uploaded PDFs / text for RAMS generation input.
CREATE TABLE IF NOT EXISTS rams_source_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rams_id     UUID        NOT NULL REFERENCES rams_records(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  doc_type    TEXT        NOT NULL DEFAULT 'other'
                          CHECK (doc_type IN (
                            'risk_assessment','method_statement','coshh_datasheet',
                            'permit_to_work','equipment_manual','other'
                          )),
  content     TEXT        NOT NULL DEFAULT '',
  page_count  INT,
  file_size   INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rams_source_docs_rams_id_idx ON rams_source_documents(rams_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MODULE SNAPSHOTS (Immutable Versioning)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Full content snapshots at key lifecycle events. Each row is WORM-protected.
-- version is auto-incrementing per module (application-assigned).
-- content stores the full assembled module JSON (stages, lessons, tests, missions).

CREATE TABLE IF NOT EXISTS module_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     UUID        NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
  version       INTEGER     NOT NULL,
  content_hash  TEXT        NOT NULL,
  content       JSONB       NOT NULL,
  trigger_event TEXT        NOT NULL CHECK (trigger_event IN ('generation_complete', 'attestation', 'redeployment')),
  created_by    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS module_snapshots_module_version_uidx ON module_snapshots(module_id, version);
CREATE INDEX IF NOT EXISTS module_snapshots_module_id_idx ON module_snapshots(module_id);

-- WORM enforcement -- snapshots are evidentiary records
CREATE OR REPLACE TRIGGER module_snapshots_no_update
  BEFORE UPDATE ON module_snapshots FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
CREATE OR REPLACE TRIGGER module_snapshots_no_delete
  BEFORE DELETE ON module_snapshots FOR EACH ROW
  EXECUTE FUNCTION prevent_evidentiary_record_modification();
REVOKE UPDATE, DELETE, TRUNCATE ON module_snapshots FROM PUBLIC;

-- Link module certificates to specific snapshot version
ALTER TABLE module_certificates ADD COLUMN IF NOT EXISTS snapshot_version INTEGER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PRIVACY & CONSENT (GDPR / ICO 2026)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Consent Records ──────────────────────────────────────────────────────────
-- Tracks consent grants/revocations per user per consent type.
-- consent_version links to the privacy notice version accepted.

CREATE TABLE IF NOT EXISTS consent_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT        NOT NULL,
  org_id          UUID        NOT NULL REFERENCES orgs(id),
  consent_type    TEXT        NOT NULL CHECK (consent_type IN (
                    'audio_capture', 'transcript_storage', 'data_processing', 'certificate_issuance'
                  )),
  consent_version TEXT        NOT NULL,
  granted         BOOLEAN     NOT NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  ip_address      TEXT,
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS consent_records_user_org_idx ON consent_records(user_id, org_id);

-- ─── Data Retention Policies ──────────────────────────────────────────────────
-- Per-org configurable retention periods for audio and transcript data.

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID        NOT NULL REFERENCES orgs(id) UNIQUE,
  audio_retention_days      INTEGER     NOT NULL DEFAULT 365,
  transcript_retention_days INTEGER     NOT NULL DEFAULT 730,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Data Deletion Requests ──────────────────────────────────────────────────
-- GDPR Article 17 — right to erasure. Admin-initiated, target = learner.

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES orgs(id),
  requested_by    TEXT        NOT NULL,
  target_user_id  TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  scope           TEXT[]      NOT NULL,
  completed_at    TIMESTAMPTZ,
  audit_ref       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_deletion_requests_org_idx ON data_deletion_requests(org_id);
