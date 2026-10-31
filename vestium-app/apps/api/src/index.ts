// ─── Vestium API ──────────────────────────────────────────────────────────────
// Fastify server — handles module generation, module registry, audit log writes,
// and reviewer portal sessions. The Claude API key lives here only.

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { sql } from './db/client.js';
import { verifySchemaHealth } from './db/schemaHealth.js';
import { clerkPlugin } from './plugins/clerk.js';
import { modulesRoutes } from './routes/modules.js';
import { auditRoutes } from './routes/audit.js';
import { orgsRoutes } from './routes/orgs.js';
import { generationRoutes } from './routes/generation.js';
import { reviewRoutes } from './routes/review.js';
import { certsRoutes, registerPublicCertRoutes } from './routes/certs.js';
import { sourceDocsRoutes } from './routes/sourceDocs.js';
import { assetsRoutes } from './routes/assets.js';
import { learnerRoutes } from './routes/learner.js';
import { verbalRoutes } from './routes/verbal.js';
import { sopRoutes } from './routes/sops.js';
import { sopGenerationRoutes } from './routes/sopGeneration.js';
import { sopReviewRoutes } from './routes/sopReview.js';
import { orgContextRoutes } from './routes/orgContext.js';
import { membersRoutes } from './routes/members.js';
import { governanceRoutes } from './routes/governance.js';
import { ramsRoutes } from './routes/rams.js';
import { ramsGenerationRoutes } from './routes/ramsGeneration.js';
import { moduleVersionRoutes } from './routes/moduleVersions.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { auditPackRoutes } from './routes/auditPack.js';
import { consentRoutes } from './routes/consent.js';
import { privacyRoutes } from './routes/privacy.js';
import './services/ramsSeedStrategy.js'; // self-registers RAMS seed strategy
import './services/moduleSeedStrategy.js'; // self-registers module seed strategy
import './services/sopSeedStrategy.js'; // self-registers SOP seed strategy
import { resolveCorsOrigin } from './utils/cors.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  bodyLimit: 1_048_576, // 1 MB default for JSON; file uploads have separate 20 MB limit
});

// ─── Startup env var validation ───────────────────────────────────────────────
// Fail fast rather than booting and crashing on the first auth request.
for (const key of ['CLERK_SECRET_KEY', 'DATABASE_URL'] as const) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required env var: ${key}. Refusing to start.`);
    process.exit(1);
  }
}
// Soft warnings — operational but degraded without these.
for (const key of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'CORS_ORIGIN'] as const) {
  if (!process.env[key]) {
    console.warn(`[startup] WARNING: ${key} not set. Some features may be unavailable.`);
  }
}

// ─── Security hardening ──────────────────────────────────────────────────────
await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'self'"] },
  },
  crossOriginEmbedderPolicy: false, // API-only server
});

// ─── CORS (frontend -> API) ───────────────────────────────────────────────────
// resolveCorsOrigin is shared with generation.ts (SSE) via utils/cors.ts.
// Wildcard '*' is explicitly rejected — credentials require a specific origin.
app.addHook('onRequest', async (request, reply) => {
  const reqOrigin = request.headers.origin ?? '';
  const corsOrigin = resolveCorsOrigin(reqOrigin);

  reply.header('Access-Control-Allow-Origin', corsOrigin);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  // Handle browser preflight before auth hooks run.
  if (request.method === 'OPTIONS') {
    return reply.code(204).send();
  }
});

// ─── Health check (unauthenticated) ──────────────────────────────────────────
app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

// ─── Static asset serving (OGL SVG files) ────────────────────────────────────
// Serves ISO 7010 SVG files from apps/api/public/assets/ at /assets/
// No auth required — SVGs are referenced by URL in API responses.
const __dirname = dirname(fileURLToPath(import.meta.url));
await app.register(fastifyStatic, {
  root: join(__dirname, '../public/assets'),
  prefix: '/assets/',
  decorateReply: false,
});

// ─── Public routes (before auth plugin) ──────────────────────────────────────
// Certificate verification is public — no Clerk JWT required.
await registerPublicCertRoutes(app);

// ─── Plugins ──────────────────────────────────────────────────────────────────
await app.register(clerkPlugin);

// ─── Routes (all require authentication via clerkPlugin) ──────────────────────
await app.register(orgsRoutes,        { prefix: '/api/orgs' });
await app.register(modulesRoutes,     { prefix: '/api/modules' });
await app.register(generationRoutes,  { prefix: '/api/generation' });
await app.register(auditRoutes,       { prefix: '/api/audit' });
await app.register(reviewRoutes,      { prefix: '/api/review' });
await app.register(certsRoutes,       { prefix: '/api/certs' });
await app.register(sourceDocsRoutes,  { prefix: '/api/source-documents' });
await app.register(assetsRoutes,      { prefix: '/api/assets' });
await app.register(learnerRoutes,     { prefix: '/api/learner' });
await app.register(verbalRoutes,      { prefix: '/api/verbal' });
await app.register(sopRoutes,         { prefix: '/api/sops' });
await app.register(sopGenerationRoutes, { prefix: '/api/sop-generation' });
await app.register(sopReviewRoutes,   { prefix: '/api/sop-review' });
await app.register(orgContextRoutes,  { prefix: '/api/org-context' });
await app.register(membersRoutes,    { prefix: '/api/members' });
await app.register(governanceRoutes, { prefix: '/api/governance' });
await app.register(ramsRoutes,       { prefix: '/api/rams' });
await app.register(ramsGenerationRoutes, { prefix: '/api/rams-generation' });
await app.register(moduleVersionRoutes, { prefix: '/api/module-versions' });
await app.register(dashboardRoutes,    { prefix: '/api/dashboard' });
await app.register(auditPackRoutes,    { prefix: '/api/audit-pack' });
await app.register(consentRoutes,      { prefix: '/api/consent' });
await app.register(privacyRoutes,      { prefix: '/api/admin' });

// ─── Stale job cleanup ────────────────────────────────────────────────────────
// Any job marked 'running' in the DB from a previous server instance is now
// orphaned — the AbortController is gone. Mark them failed so isActive is correct.
try {
  const stale = await sql`
    UPDATE generation_jobs SET status = 'failed', error = 'Server restarted during generation', updated_at = now()
    WHERE status = 'running'
    RETURNING module_id
  ` as Array<{ module_id: string }>;
  if (stale.length > 0) {
    console.log(`[startup] Marked ${stale.length} stale generation job(s) as failed`);
  }
} catch (err) {
  console.warn('[startup] Could not clean up stale generation jobs:', err);
}

// Stale content generation jobs (v2 governance layer)
try {
  const staleContent = await sql`
    UPDATE content_generation_jobs SET status = 'failed', error = 'Server restarted during generation', updated_at = now()
    WHERE status = 'running'
    RETURNING registry_id
  ` as Array<{ registry_id: string }>;
  if (staleContent.length > 0) {
    console.log(`[startup] Marked ${staleContent.length} stale content generation job(s) as failed`);
  }
} catch (err) {
  console.warn('[startup] Could not clean up stale content generation jobs:', err);
}

// ─── Schema health check ─────────────────────────────────────────────────────
// Warn on missing unique/primary constraints required by ON CONFLICT paths.
try {
  const health = await verifySchemaHealth();
  if (!health.ok) {
    console.warn('[startup] Schema health check failed: missing constraints required by runtime upserts:');
    for (const item of health.missing) {
      console.warn(`[startup]   - ${item}`);
    }
    console.warn('[startup] Run: pnpm --filter @complianceforge/api run db:migrate');
  }
} catch (err) {
  console.warn('[startup] Schema health check could not run:', err);
}

// ─── Data retention cleanup ──────────────────────────────────────────────────
// Per-org: null out expired audio data and redact expired transcripts.
async function runRetentionCleanup() {
  try {
    const policies = await sql`SELECT org_id, audio_retention_days, transcript_retention_days FROM data_retention_policies`;
    for (const p of policies) {
      const orgId = p.org_id as string;
      const audioDays = p.audio_retention_days as number;
      const transcriptDays = p.transcript_retention_days as number;

      const audioResult = await sql`
        UPDATE verbal_responses SET audio_data = NULL
        WHERE org_id = ${orgId} AND audio_data IS NOT NULL
          AND created_at < now() - make_interval(days => ${audioDays})
      ` as Array<Record<string, unknown>> & { count: number };
      const transcriptResult = await sql`
        UPDATE verbal_responses SET transcript = '[REDACTED]', manager_note = '[REDACTED]'
        WHERE org_id = ${orgId} AND transcript IS NOT NULL AND transcript != '[REDACTED]'
          AND created_at < now() - make_interval(days => ${transcriptDays})
      ` as Array<Record<string, unknown>> & { count: number };

      if (audioResult.count > 0 || transcriptResult.count > 0) {
        console.log(`[retention] Org ${orgId}: purged ${audioResult.count} audio, ${transcriptResult.count} transcripts`);
      }
    }
  } catch (err) {
    console.warn('[retention] Cleanup failed:', err);
  }
}
setInterval(runRetentionCleanup, 86_400_000); // every 24h
void runRetentionCleanup(); // run on boot

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Vestium API listening on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
