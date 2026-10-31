// ─── Verbal Response routes ───────────────────────────────────────────────────
// Handles learner verbal assessment submissions:
//   POST /:moduleId/:lessonId/:questionId  — submit audio (base64 JSON)
//   GET  /                                  — list responses for org (no audio_data)
//   GET  /:id/audio                         — stream raw audio bytes
//   PATCH /:id/disposition                  — manager review + WORM audit log
//
// Async pipeline (fire-and-forget after 201):
//   Whisper transcription → Claude Haiku attribution → auto-finding if confidence < 0.6

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../db/client.js';
import { writeAuditLog } from '../db/audit.js';
import type { ApiResponse, VerbalResponseRecord } from '@complianceforge/types';
import type { GenerationJob, StageLessonsOutput } from '../pipeline/types.js';
import type { TrainingQuestion } from '../lib/training-core/types.js';
import { requireRole } from '../plugins/rbac.js';

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const MAX_AUDIO_BASE64_LENGTH = 10_000_000; // ~7.5 MB decoded audio

const SubmitVerbalSchema = z.object({
  audioBase64:    z.string().max(MAX_AUDIO_BASE64_LENGTH).optional(), // absent when answered=false
  mimeType:       z.string().default('audio/webm'),
  durationMs:     z.number().int().optional(),
  answered:       z.boolean(),
  questionPrompt: z.string().min(1),
  regulatoryRef:  z.string().optional(),
  timerSeconds:   z.number().int(),
  expectedKeywords: z.array(z.string().min(2)).max(12).optional(),
  minKeywordHits: z.number().int().min(1).max(12).optional(),
});

const DispositionSchema = z.object({
  disposition: z.enum(['confirmed', 'flagged']),
  note:        z.string().optional(),
});

// ─── DB row shape returned by queries ────────────────────────────────────────

type VerbalRow = {
  id: string;
  module_id: string;
  lesson_id: string;
  question_id: string;
  question_prompt: string;
  regulatory_ref: string | null;
  timer_seconds: number;
  learner_user_id: string;
  org_id: string;
  answered: boolean;
  duration_ms: number | null;
  transcript: string | null;
  transcript_model: string | null;
  transcribed_at: string | null;
  attribution_confidence: string | null;
  attribution_reasoning: string | null;
  attribution_contradictions: string[] | null;
  attributed_at: string | null;
  manager_disposition: 'pending' | 'confirmed' | 'flagged';
  manager_user_id: string | null;
  manager_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type VerbalRubric = {
  expectedKeywords: string[];
  minKeywordHits: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreKeywordCoverage(transcript: string, rubric: VerbalRubric): {
  matched: string[];
  missing: string[];
  hits: number;
  coverage: number;
  passed: boolean;
} {
  const tokens = new Set(tokenize(transcript));
  const transcriptLower = transcript.toLowerCase();
  const expected = rubric.expectedKeywords
    .map((k) => k.trim().toLowerCase())
    .filter((k, i, arr) => k.length > 1 && arr.indexOf(k) === i);

  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of expected) {
    const hit = kw.includes(' ')
      ? transcriptLower.includes(kw)
      : tokens.has(kw);
    if (hit) matched.push(kw);
    else missing.push(kw);
  }

  const hits = matched.length;
  const coverage = expected.length > 0 ? hits / expected.length : 0;
  return {
    matched,
    missing,
    hits,
    coverage,
    passed: hits >= Math.max(1, rubric.minKeywordHits),
  };
}

async function lookupVerbalRubric(moduleId: string, lessonId: string, questionId: string): Promise<VerbalRubric | null> {
  const rows = await sql`
    SELECT job_state FROM generation_jobs
    WHERE module_id = ${moduleId}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const job = (rows[0] as { job_state: GenerationJob }).job_state;
  const steps = (job as GenerationJob).steps ?? {};
  for (const [key, step] of Object.entries(steps)) {
    if (!/^stage_\d+$/.test(key)) continue;
    const parsed = step?.parsedJson as StageLessonsOutput | undefined;
    const lessons = parsed?.stage?.lessons ?? [];
    for (const lesson of lessons) {
      if (lesson.id !== lessonId) continue;
      const q = lesson.quiz.find((x) => x.id === questionId && x.type === 'verbal') as TrainingQuestion | undefined;
      if (!q) continue;
      const expectedKeywords = Array.isArray(q.expectedKeywords)
        ? q.expectedKeywords.map((k) => k.trim()).filter((k) => k.length > 1).slice(0, 12)
        : [];
      const minKeywordHits = typeof q.minKeywordHits === 'number'
        ? q.minKeywordHits
        : Math.max(2, Math.ceil(expectedKeywords.length * 0.5));
      if (expectedKeywords.length === 0) return null;
      return {
        expectedKeywords,
        minKeywordHits: Math.min(Math.max(minKeywordHits, 1), expectedKeywords.length),
      };
    }
  }
  return null;
}

function rowToRecord(row: VerbalRow): VerbalResponseRecord {
  return {
    id:                       row.id,
    moduleId:                 row.module_id,
    lessonId:                 row.lesson_id,
    questionId:               row.question_id,
    questionPrompt:           row.question_prompt,
    regulatoryRef:            row.regulatory_ref ?? undefined,
    timerSeconds:             row.timer_seconds,
    learnerUserId:            row.learner_user_id,
    orgId:                    row.org_id,
    answered:                 row.answered,
    durationMs:               row.duration_ms ?? undefined,
    transcript:               row.transcript ?? undefined,
    transcriptModel:          row.transcript_model ?? undefined,
    transcribedAt:            row.transcribed_at ?? undefined,
    attributionConfidence:    row.attribution_confidence != null
                                ? Number(row.attribution_confidence) : undefined,
    attributionReasoning:     row.attribution_reasoning ?? undefined,
    attributionContradictions: row.attribution_contradictions ?? undefined,
    attributedAt:             row.attributed_at ?? undefined,
    managerDisposition:       row.manager_disposition,
    managerUserId:            row.manager_user_id ?? undefined,
    managerNote:              row.manager_note ?? undefined,
    reviewedAt:               row.reviewed_at ?? undefined,
    createdAt:                row.created_at,
  };
}

// ─── Async transcription + attribution pipeline ───────────────────────────────

async function runTranscriptionPipeline(id: string): Promise<void> {
  // 1. Fetch the row (including audio_data for Whisper)
  const rows = await sql`
    SELECT id, answered, audio_data, audio_mime_type, question_prompt, regulatory_ref,
           module_id, org_id, learner_user_id, question_id, lesson_id, timer_seconds
    FROM verbal_responses WHERE id = ${id}
  `;
  if (rows.length === 0) return;
  const row = rows[0] as {
    id: string;
    answered: boolean;
    audio_data: Buffer | string | null;
    audio_mime_type: string;
    question_prompt: string;
    regulatory_ref: string | null;
    module_id: string;
    org_id: string;
    learner_user_id: string;
    question_id: string;
    lesson_id: string;
    timer_seconds: number;
  };

  let transcript: string | null = null;
  let keywordScore:
    | {
        matched: string[];
        missing: string[];
        hits: number;
        coverage: number;
        passed: boolean;
      }
    | null = null;

  // 2. Whisper transcription (skip if no audio or no API key)
  if (row.answered && row.audio_data && process.env.OPENAI_API_KEY) {
    try {
      const audioBuffer = Buffer.isBuffer(row.audio_data)
        ? row.audio_data
        : Buffer.from(row.audio_data, 'base64');

      const form = new FormData();
      const blob = new Blob([audioBuffer], { type: row.audio_mime_type });
      form.append('file', blob, 'audio.webm');
      form.append('model', 'whisper-1');
      form.append('language', 'en');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });

      if (whisperRes.ok) {
        const json = await whisperRes.json() as { text?: string };
        transcript = json.text ?? null;
        if (transcript) {
          await sql`
            UPDATE verbal_responses
            SET transcript = ${transcript},
                transcript_model = 'whisper-1',
                transcribed_at = NOW()
            WHERE id = ${id}
          `;
        }
      } else {
        console.warn(`[verbal] Whisper failed for ${id}: ${whisperRes.status}`);
      }
    } catch (err) {
      console.error(`[verbal] Whisper error for ${id}:`, err);
    }
  } else if (row.answered && row.audio_data && !process.env.OPENAI_API_KEY) {
    console.warn(`[verbal] OPENAI_API_KEY not set — skipping transcription for ${id}`);
  }

  // 3. Keyword rubric scoring (if a verbal rubric exists and transcript available)
  const rubric = await lookupVerbalRubric(row.module_id, row.lesson_id, row.question_id);
  if (transcript && rubric) {
    keywordScore = scoreKeywordCoverage(transcript, rubric);
  }

  // 4. Claude Haiku attribution (only if we have a transcript)
  let attributionConfidence: number | null = null;

  if (transcript) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const attributionPrompt =
        `You are a UK health and safety competency assessor.\n` +
        `Question: ${row.question_prompt}\n` +
        `Regulatory reference: ${row.regulatory_ref ?? 'not specified'}\n` +
        `Learner transcript: ${transcript}\n\n` +
        `Assess whether the transcript demonstrates adequate understanding of the regulatory duty.\n` +
        `Respond ONLY with valid JSON: ` +
        `{ "attributed": boolean, "confidence": number (0.0–1.0), "reasoning": string, "contradictions": string[] }`;

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: attributionPrompt }],
      });

      const content = message.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            attributed?: boolean;
            confidence?: number;
            reasoning?: string;
            contradictions?: string[];
          };
          attributionConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : null;
          await sql`
            UPDATE verbal_responses
            SET attribution_confidence     = ${attributionConfidence},
                attribution_reasoning      = ${parsed.reasoning ?? null},
                attribution_contradictions = ${parsed.contradictions ?? []},
                attributed_at              = NOW()
            WHERE id = ${id}
          `;
        }
      }
    } catch (err) {
      console.error(`[verbal] Claude attribution error for ${id}:`, err);
    }
  }

  // 5. Persist deterministic rubric result even if Claude call is unavailable.
  if (transcript && keywordScore) {
    const combinedConfidence =
      attributionConfidence === null
        ? keywordScore.coverage
        : (attributionConfidence * 0.6) + (keywordScore.coverage * 0.4);
    attributionConfidence = combinedConfidence;
    const keywordReasoning =
      `Keyword evidence: ${keywordScore.hits}/${rubric?.expectedKeywords.length ?? 0} ` +
      `matched (required ${rubric?.minKeywordHits ?? 0}). ` +
      `Matched: ${keywordScore.matched.join(', ') || 'none'}. ` +
      `Missing: ${keywordScore.missing.join(', ') || 'none'}.`;
    await sql`
      UPDATE verbal_responses
      SET attribution_confidence = ${combinedConfidence},
          attribution_reasoning = CASE
            WHEN attribution_reasoning IS NULL OR attribution_reasoning = '' THEN ${keywordReasoning}
            ELSE attribution_reasoning || E'\n' || ${keywordReasoning}
          END,
          attribution_contradictions = ${keywordScore.missing},
          attributed_at = NOW()
      WHERE id = ${id}
    `;
  }

  // 6. Auto-finding: non-response OR no transcription OR low confidence OR keyword fail
  const missingTranscript = row.answered && !transcript;
  const keywordFailed = keywordScore ? !keywordScore.passed : false;
  const shouldFlag =
    !row.answered ||
    missingTranscript ||
    keywordFailed ||
    (attributionConfidence !== null && attributionConfidence < 0.6);
  if (shouldFlag) {
    try {
      const reason = !row.answered
        ? 'Learner did not provide a verbal response (timer expired or microphone denied).'
        : missingTranscript
          ? 'Verbal response could not be transcribed, so competency could not be evidenced.'
          : keywordFailed
            ? `Transcript did not meet keyword evidence threshold (${keywordScore?.hits ?? 0}/${rubric?.minKeywordHits ?? 0} required).`
            : `Verbal response received low attribution confidence (${attributionConfidence?.toFixed(2)}). Transcript may not demonstrate adequate regulatory understanding.`;

      await sql`
        INSERT INTO review_findings
          (module_id, severity, category, description, location, regulatory_ref)
        VALUES (
          ${row.module_id}::uuid,
          'high',
          'A',
          ${`Verbal assessment flag — ${row.question_prompt.slice(0, 100)}. ${reason}`},
          ${`Lesson ${row.lesson_id}, Question ${row.question_id}`},
          ${row.regulatory_ref ?? null}
        )
      `;
    } catch (err) {
      console.error(`[verbal] Auto-finding insert error for ${id}:`, err);
    }
  }
}

// ─── Helper: resolve org UUID from clerk_org_id ───────────────────────────────

async function resolveOrgUuid(clerkOrgId: string): Promise<string | null> {
  const rows = await sql`SELECT id FROM orgs WHERE clerk_org_id = ${clerkOrgId}`;
  return rows.length > 0 ? (rows[0] as { id: string }).id : null;
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export const verbalRoutes: FastifyPluginAsync = async (app) => {
  // POST /:moduleId/:lessonId/:questionId — submit verbal response
  app.post<{
    Params: { moduleId: string; lessonId: string; questionId: string };
    Body: unknown;
  }>('/:moduleId/:lessonId/:questionId', async (request, reply) => {
    const { userId, orgId } = request.auth;
    const { moduleId, lessonId, questionId } = request.params;

    const parsed = SubmitVerbalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.message } satisfies ApiResponse<never>);
    }
    const body = parsed.data;

    const orgUuid = await resolveOrgUuid(orgId ?? '');
    if (!orgUuid) {
      return reply.code(404).send({ ok: false, error: 'Org not found' } satisfies ApiResponse<never>);
    }

    // ── Consent gate: require active audio_capture + transcript_storage consent ──
    if (body.answered && body.audioBase64) {
      const consentRows = await sql`
        SELECT consent_type FROM consent_records
        WHERE user_id = ${userId} AND org_id = ${orgUuid}
          AND consent_type IN ('audio_capture', 'transcript_storage')
          AND granted = true AND revoked_at IS NULL
      `;
      const grantedTypes = new Set((consentRows as Array<{ consent_type: string }>).map((r) => r.consent_type));
      if (!grantedTypes.has('audio_capture') || !grantedTypes.has('transcript_storage')) {
        return reply.code(403).send({
          ok: false,
          error: 'Active consent for audio capture and transcript storage is required before submitting a verbal response. Please grant consent first.',
        } satisfies ApiResponse<never>);
      }
    }

    const audioBuffer = body.audioBase64
      ? Buffer.from(body.audioBase64, 'base64')
      : null;

    const insertRows = await sql`
      INSERT INTO verbal_responses
        (module_id, lesson_id, question_id, question_prompt, regulatory_ref,
         timer_seconds, learner_user_id, org_id,
         audio_data, audio_mime_type, duration_ms, answered)
      VALUES (
        ${moduleId}, ${lessonId}, ${questionId}, ${body.questionPrompt},
        ${body.regulatoryRef ?? null}, ${body.timerSeconds},
        ${userId}, ${orgUuid},
        ${audioBuffer}, ${body.mimeType},
        ${body.durationMs ?? null}, ${body.answered}
      )
      RETURNING id
    `;

    const insertedId = (insertRows[0] as { id: string }).id;

    await sql`
      UPDATE verbal_responses SET blob_key = ${'internal:' + insertedId} WHERE id = ${insertedId}
    `;

    setImmediate(() => void runTranscriptionPipeline(insertedId).catch(console.error));

    return reply.code(201).send({
      ok: true,
      data: { id: insertedId, status: 'processing' },
    } satisfies ApiResponse<{ id: string; status: string }>);
  });

  // GET / — list verbal responses for caller's org (no audio_data)
  // RBAC: admin, hr_manager, reviewer — learners must not access other learners' responses.
  app.get<{
    Querystring: { moduleId?: string; disposition?: string };
  }>('/', { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] }, async (request, reply) => {
    const { orgId } = request.auth;
    const orgUuid = await resolveOrgUuid(orgId ?? '');
    if (!orgUuid) {
      return reply.code(404).send({ ok: false, error: 'Org not found' } satisfies ApiResponse<never>);
    }

    const { moduleId, disposition } = request.query;

    let rows: unknown[];
    if (moduleId && disposition) {
      rows = await sql`
        SELECT id, module_id, lesson_id, question_id, question_prompt, regulatory_ref,
               timer_seconds, learner_user_id, org_id, answered, duration_ms,
               transcript, transcript_model, transcribed_at,
               attribution_confidence, attribution_reasoning, attribution_contradictions, attributed_at,
               manager_disposition, manager_user_id, manager_note, reviewed_at, created_at
        FROM verbal_responses
        WHERE org_id = ${orgUuid} AND module_id = ${moduleId} AND manager_disposition = ${disposition}
        ORDER BY created_at DESC
      `;
    } else if (moduleId) {
      rows = await sql`
        SELECT id, module_id, lesson_id, question_id, question_prompt, regulatory_ref,
               timer_seconds, learner_user_id, org_id, answered, duration_ms,
               transcript, transcript_model, transcribed_at,
               attribution_confidence, attribution_reasoning, attribution_contradictions, attributed_at,
               manager_disposition, manager_user_id, manager_note, reviewed_at, created_at
        FROM verbal_responses
        WHERE org_id = ${orgUuid} AND module_id = ${moduleId}
        ORDER BY created_at DESC
      `;
    } else if (disposition) {
      rows = await sql`
        SELECT id, module_id, lesson_id, question_id, question_prompt, regulatory_ref,
               timer_seconds, learner_user_id, org_id, answered, duration_ms,
               transcript, transcript_model, transcribed_at,
               attribution_confidence, attribution_reasoning, attribution_contradictions, attributed_at,
               manager_disposition, manager_user_id, manager_note, reviewed_at, created_at
        FROM verbal_responses
        WHERE org_id = ${orgUuid} AND manager_disposition = ${disposition}
        ORDER BY created_at DESC
      `;
    } else {
      rows = await sql`
        SELECT id, module_id, lesson_id, question_id, question_prompt, regulatory_ref,
               timer_seconds, learner_user_id, org_id, answered, duration_ms,
               transcript, transcript_model, transcribed_at,
               attribution_confidence, attribution_reasoning, attribution_contradictions, attributed_at,
               manager_disposition, manager_user_id, manager_note, reviewed_at, created_at
        FROM verbal_responses
        WHERE org_id = ${orgUuid}
        ORDER BY created_at DESC
      `;
    }

    const records = (rows as VerbalRow[]).map(rowToRecord);
    return reply.send({ ok: true, data: records } satisfies ApiResponse<VerbalResponseRecord[]>);
  });

  // GET /:id/audio — stream raw audio bytes
  // RBAC: admin, hr_manager, reviewer — audio contains learner PII.
  app.get<{ Params: { id: string } }>('/:id/audio', { preHandler: [requireRole('admin', 'hr_manager', 'reviewer')] }, async (request, reply) => {
    const { orgId } = request.auth;
    const orgUuid = await resolveOrgUuid(orgId ?? '');
    if (!orgUuid) {
      return reply.code(404).send({ ok: false, error: 'Org not found' } satisfies ApiResponse<never>);
    }

    const rows = await sql`
      SELECT audio_data, audio_mime_type FROM verbal_responses
      WHERE id = ${request.params.id} AND org_id = ${orgUuid}
    `;
    if (rows.length === 0) {
      return reply.code(404).send({ ok: false, error: 'Not found' } satisfies ApiResponse<never>);
    }
    const row = rows[0] as { audio_data: Buffer | null; audio_mime_type: string };
    if (!row.audio_data) {
      return reply.code(404).send({ ok: false, error: 'No audio stored' } satisfies ApiResponse<never>);
    }

    reply.header('Content-Type', row.audio_mime_type);
    reply.header('Content-Length', row.audio_data.length);
    return reply.send(row.audio_data);
  });

  // PATCH /:id/disposition — manager review
  // RBAC: admin, hr_manager only — disposition is a management action.
  app.patch<{
    Params: { id: string };
    Body: unknown;
  }>('/:id/disposition', { preHandler: [requireRole('admin', 'hr_manager')] }, async (request, reply) => {
    const { userId, orgId, role } = request.auth;

    const parsed = DispositionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.message } satisfies ApiResponse<never>);
    }
    const { disposition, note } = parsed.data;

    const orgUuid = await resolveOrgUuid(orgId ?? '');
    if (!orgUuid) {
      return reply.code(404).send({ ok: false, error: 'Org not found' } satisfies ApiResponse<never>);
    }

    const existing = await sql`
      SELECT id, module_id FROM verbal_responses
      WHERE id = ${request.params.id} AND org_id = ${orgUuid}
    `;
    if (existing.length === 0) {
      return reply.code(404).send({ ok: false, error: 'Not found' } satisfies ApiResponse<never>);
    }
    const existingRow = existing[0] as { id: string; module_id: string };

    await sql`
      UPDATE verbal_responses
      SET manager_disposition = ${disposition},
          manager_user_id     = ${userId},
          manager_note        = ${note ?? null},
          reviewed_at         = NOW()
      WHERE id = ${request.params.id}
    `;

    await writeAuditLog({
      orgId:    orgUuid,
      moduleId: existingRow.module_id,
      userId,
      userRole: role,
      action:   'verbal_response_reviewed',
      payload:  { verbalResponseId: request.params.id, disposition, note: note ?? null },
    });

    return reply.send({ ok: true, data: { id: request.params.id, disposition } } satisfies ApiResponse<{ id: string; disposition: string }>);
  });
};
