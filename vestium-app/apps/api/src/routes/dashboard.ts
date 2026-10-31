// ─── Evidence Dashboard Routes ───────────────────────────────────────────────
// Org-level analytics: completion rates, reviewer activity, findings breakdown,
// certificate issuance, and audit export.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { requireRole } from '../plugins/rbac.js';
import type { ApiResponse } from '@complianceforge/types';

// ─── Response types ──────────────────────────────────────────────────────────

interface DashboardOverview {
  modulesTotal: number;
  modulesDeployed: number;
  modulesDraft: number;
  modulesInReview: number;
  modulesStale: number;
  sopsTotal: number;
  ramsTotal: number;
  attestationsThisMonth: number;
  certsIssued: number;
  unresolvedRedFindings: number;
}

interface CompletionRow {
  moduleId: string;
  title: string;
  learnersStarted: number;
  learnersCompleted: number;
  avgScore: number | null;
  passRate: number | null;
}

interface ReviewerRow {
  name: string;
  userId: string;
  modulesReviewed: number;
  avgReviewDays: number | null;
  lastActivity: string | null;
}

interface FindingsSummary {
  total: number;
  bySeverity: Record<string, number>;
  undisposed: Record<string, number>;
  dispositionRate: number;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const dashboardRoutes: FastifyPluginAsync = async (app) => {

  // ── Helper: resolve DB org ID from Clerk org ID ──────────────────────────
  async function resolveOrgId(clerkOrgId: string): Promise<string | null> {
    const rows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${clerkOrgId}`;
    return rows[0] ? (rows[0] as { id: string }).id : null;
  }

  // GET /api/dashboard/overview
  app.get('/overview', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<DashboardOverview>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const [moduleStats, sopCount, ramsCount, attestCount, certCount, redFindings] = await Promise.all([
      sql`SELECT status, count(*)::int AS c FROM modules WHERE org_id = ${dbOrgId} GROUP BY status`,
      sql`SELECT count(*)::int AS c FROM sop_records WHERE org_id = ${dbOrgId}`,
      sql`SELECT count(*)::int AS c FROM rams_records WHERE org_id = ${dbOrgId}`,
      sql`
        SELECT count(*)::int AS c FROM attestations a
        JOIN modules m ON a.module_id = m.id
        WHERE m.org_id = ${dbOrgId} AND a.attested_at >= date_trunc('month', now())
      `,
      sql`SELECT count(*)::int AS c FROM module_certificates WHERE org_id = ${dbOrgId}`,
      sql`
        SELECT count(*)::int AS c FROM review_findings rf
        JOIN modules m ON m.id = rf.module_id
        WHERE m.org_id = ${dbOrgId} AND rf.severity = 'regulatory' AND rf.disposition IS NULL
      `,
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of moduleStats) {
      statusMap[row.status as string] = row.c as number;
    }

    return {
      ok: true,
      data: {
        modulesTotal: Object.values(statusMap).reduce((a, b) => a + b, 0),
        modulesDeployed: statusMap['deployed'] ?? 0,
        modulesDraft: statusMap['draft'] ?? 0,
        modulesInReview: statusMap['in_review'] ?? 0,
        modulesStale: statusMap['stale'] ?? 0,
        sopsTotal: (sopCount[0] as { c: number }).c,
        ramsTotal: (ramsCount[0] as { c: number }).c,
        attestationsThisMonth: (attestCount[0] as { c: number }).c,
        certsIssued: (certCount[0] as { c: number }).c,
        unresolvedRedFindings: (redFindings[0] as { c: number }).c,
      },
    };
  });

  // GET /api/dashboard/completion
  app.get('/completion', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<CompletionRow[]>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const rows = await sql`
      SELECT
        m.id AS module_id, m.title,
        count(DISTINCT CASE WHEN al.action = 'learner_started' THEN al.user_id END)::int AS started,
        count(DISTINCT CASE WHEN al.action = 'learner_completed' THEN al.user_id END)::int AS completed
      FROM modules m
      LEFT JOIN audit_log al ON al.module_id = m.id AND al.action IN ('learner_started', 'learner_completed')
      WHERE m.org_id = ${dbOrgId} AND m.status = 'deployed'
      GROUP BY m.id, m.title
      ORDER BY m.title
      LIMIT 200
    `;

    // Get average scores from learner_certificates
    const scoreRows = await sql`
      SELECT lc.module_id,
        avg(lc.score)::numeric(5,1) AS avg_score,
        (count(*) FILTER (WHERE lc.passed) * 100.0 / NULLIF(count(*), 0))::numeric(5,1) AS pass_rate
      FROM learner_certificates lc
      WHERE lc.org_id = ${dbOrgId}
      GROUP BY lc.module_id
    `;
    const scoreMap: Record<string, { avg: number; rate: number }> = {};
    for (const sr of scoreRows) {
      scoreMap[sr.module_id as string] = {
        avg: Number(sr.avg_score ?? 0),
        rate: Number(sr.pass_rate ?? 0),
      };
    }

    return {
      ok: true,
      data: rows.map((r) => ({
        moduleId: r.module_id as string,
        title: r.title as string,
        learnersStarted: r.started as number,
        learnersCompleted: r.completed as number,
        avgScore: scoreMap[r.module_id as string]?.avg ?? null,
        passRate: scoreMap[r.module_id as string]?.rate ?? null,
      })),
    };
  });

  // GET /api/dashboard/reviewer-activity
  app.get('/reviewer-activity', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<ReviewerRow[]>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const rows = await sql`
      SELECT
        a.reviewer_name, a.reviewer_user_id,
        count(*)::int AS modules_reviewed,
        avg(EXTRACT(EPOCH FROM (a.attested_at - m.updated_at)) / 86400)::numeric(5,1) AS avg_review_days,
        max(a.attested_at) AS last_activity
      FROM attestations a
      JOIN modules m ON a.module_id = m.id
      WHERE m.org_id = ${dbOrgId}
      GROUP BY a.reviewer_name, a.reviewer_user_id
      ORDER BY modules_reviewed DESC
      LIMIT 50
    `;

    return {
      ok: true,
      data: rows.map((r) => ({
        name: r.reviewer_name as string,
        userId: r.reviewer_user_id as string,
        modulesReviewed: r.modules_reviewed as number,
        avgReviewDays: r.avg_review_days ? Number(r.avg_review_days) : null,
        lastActivity: r.last_activity ? String(r.last_activity) : null,
      })),
    };
  });

  // GET /api/dashboard/findings-summary
  app.get('/findings-summary', { preHandler: [requireRole('admin', 'reviewer')] }, async (request, reply): Promise<ApiResponse<FindingsSummary>> => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const rows = await sql`
      SELECT rf.severity, rf.disposition IS NOT NULL AS disposed, count(*)::int AS c
      FROM review_findings rf
      JOIN modules m ON m.id = rf.module_id
      WHERE m.org_id = ${dbOrgId}
      GROUP BY rf.severity, (rf.disposition IS NOT NULL)
    `;

    const bySeverity: Record<string, number> = {};
    const undisposed: Record<string, number> = {};
    let total = 0;
    let disposedCount = 0;

    for (const r of rows) {
      const sev = r.severity as string;
      const disposed = r.disposed as boolean;
      const count = r.c as number;
      total += count;
      bySeverity[sev] = (bySeverity[sev] ?? 0) + count;
      if (disposed) {
        disposedCount += count;
      } else {
        undisposed[sev] = (undisposed[sev] ?? 0) + count;
      }
    }

    return {
      ok: true,
      data: {
        total,
        bySeverity,
        undisposed,
        dispositionRate: total > 0 ? Math.round((disposedCount / total) * 100) : 100,
      },
    };
  });

  // GET /api/dashboard/audit-export?from=&to=&format=csv|json
  app.get('/audit-export', { preHandler: [requireRole('admin')] }, async (request, reply) => {
    const { orgId } = request.auth;
    if (!orgId) { reply.status(400); return { ok: false, error: 'No active org' }; }
    const dbOrgId = await resolveOrgId(orgId);
    if (!dbOrgId) { reply.status(404); return { ok: false, error: 'Org not found' }; }

    const query = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      format: z.enum(['csv', 'json']).default('json'),
    }).parse(request.query);

    let rows;
    if (query.from && query.to) {
      rows = await sql`
        SELECT id, module_id, user_id, action, payload, created_at
        FROM audit_log
        WHERE org_id = ${dbOrgId}
          AND created_at >= ${query.from}
          AND created_at <= ${query.to}
        ORDER BY created_at ASC
        LIMIT 10000
      `;
    } else {
      rows = await sql`
        SELECT id, module_id, user_id, action, payload, created_at
        FROM audit_log
        WHERE org_id = ${dbOrgId}
        ORDER BY created_at ASC
        LIMIT 10000
      `;
    }

    if (query.format === 'csv') {
      const header = 'id,module_id,user_id,action,payload,created_at\n';
      const csvRows = rows.map((r) =>
        `${r.id},${r.module_id ?? ''},${r.user_id},"${r.action}","${JSON.stringify(r.payload).replace(/"/g, '""')}",${r.created_at}`
      ).join('\n');
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="audit-export.csv"');
      return header + csvRows;
    }

    return { ok: true, data: rows };
  });
};
