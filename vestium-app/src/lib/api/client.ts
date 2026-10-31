// ─── Vestium API client ───────────────────────────────────────────────────────
// Plain fetch wrapper — not a React hook.
// All functions take an auth token as the first argument.
// The token comes from Clerk's useAuth().getToken() in the calling hook.

import type {
  AttestationRecord,
  CreateModuleRequest,
  DirectorModuleRecord,
  LearnerCertRecord,
  ModuleCertRecord,
  ModuleRecord,
  OrgRecord,
  OrgMemberRecord,
  OrgRole,
  OrgContextDTO,
  RegulatoryContradiction,
  ReviewFinding,
  VerbalResponseRecord,
  SopRecord,
  SopSourceDocRecord,
  SopReviewFinding,
  SopAttestationRecord,
  GovernedFinding,
  GovernedAttestation,
  GovernedCertificate,
  RamsRecord,
  RamsSourceDocRecord,
  ApiResponse,
  WorkplaceContextDTO,
  ClassificationSummaryDTO,
  ModuleSnapshotSummary,
  ModuleSnapshotFull,
  SnapshotDiffEntry,
} from '@complianceforge/types';
import type { JobStepEvent } from './types';
export type { JobStepEvent };

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function isBackendMode(): boolean {
  return Boolean(API_URL);
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function apiFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };
  // Only set Content-Type for requests that actually carry a JSON body.
  // Sending Content-Type: application/json on a bodyless DELETE/GET causes
  // Fastify to attempt body parsing and return a 400 Bad Request.
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  const json = await res.json() as
    | ApiResponse<T>
    | { statusCode: number; error: string; message: string };  // Fastify built-in error shape
  // Fastify built-in errors use { statusCode, error, message } without an `ok` field.
  // Normalise them so callers always see ApiResponse shape.
  if (!('ok' in json)) {
    return { ok: false, error: [json.error, json.message].filter(Boolean).join(': ') || 'Unknown error' };
  }
  return json;
}

// ─── Modules ──────────────────────────────────────────────────────────────────

export async function createModule(
  token: string,
  req: CreateModuleRequest
): Promise<ApiResponse<ModuleRecord>> {
  return apiFetch<ModuleRecord>(token, '/api/modules', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function listModules(token: string): Promise<ApiResponse<ModuleRecord[]>> {
  return apiFetch<ModuleRecord[]>(token, '/api/modules');
}

export async function deleteModule(token: string, moduleId: string): Promise<ApiResponse<{ deleted: true }>> {
  return apiFetch<{ deleted: true }>(token, `/api/modules/${moduleId}`, { method: 'DELETE' });
}

export async function getDirectorView(token: string): Promise<ApiResponse<DirectorModuleRecord[]>> {
  return apiFetch<DirectorModuleRecord[]>(token, '/api/modules/director');
}

// ─── Orgs ─────────────────────────────────────────────────────────────────────

export async function getOrgMe(token: string): Promise<ApiResponse<OrgRecord>> {
  return apiFetch<OrgRecord>(token, '/api/orgs/me');
}

// ─── Org Context ─────────────────────────────────────────────────────────────

export async function getOrgContext(token: string): Promise<ApiResponse<OrgContextDTO | null>> {
  return apiFetch<OrgContextDTO | null>(token, '/api/org-context');
}

// ─── Reviewer workflow ───────────────────────────────────────────────────────

export async function listFindings(
  token: string,
  moduleId: string
): Promise<ApiResponse<ReviewFinding[]>> {
  return apiFetch<ReviewFinding[]>(token, `/api/review/${moduleId}/findings`);
}

export async function createFinding(
  token: string,
  moduleId: string,
  req: {
    severity: 'regulatory' | 'high' | 'medium' | 'low';
    category: 'A' | 'B';
    description: string;
    location: string;
    regulatoryRef?: string;
  }
): Promise<ApiResponse<ReviewFinding>> {
  return apiFetch<ReviewFinding>(token, `/api/review/${moduleId}/findings`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function logGatedWindowOpen(token: string, findingId: string): Promise<void> {
  await apiFetch(token, `/api/review/findings/${findingId}/gate-open`, { method: 'POST' });
}

export async function logGatedWindowUnlock(token: string, findingId: string): Promise<void> {
  await apiFetch(token, `/api/review/findings/${findingId}/gate-unlock`, { method: 'POST' });
}

export async function setFindingDisposition(
  token: string,
  findingId: string,
  req: { disposition: 'accepted' | 'amended' | 'escalated'; rationale: string }
): Promise<ApiResponse<ReviewFinding>> {
  return apiFetch<ReviewFinding>(token, `/api/review/findings/${findingId}/disposition`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
}

export async function seedFindingsFromGeneration(
  token: string,
  moduleId: string
): Promise<ApiResponse<{ created: number; skipped: number }>> {
  return apiFetch<{ created: number; skipped: number }>(token, `/api/review/${moduleId}/seed-findings`, {
    method: 'POST',
  });
}

export async function listContradictions(
  token: string,
  moduleId: string
): Promise<ApiResponse<RegulatoryContradiction[]>> {
  return apiFetch<RegulatoryContradiction[]>(token, `/api/review/${moduleId}/contradictions`);
}

export async function openGate(
  token: string,
  moduleId: string,
  findingId: string,
  description: string,
  regulatoryRef?: string
): Promise<ApiResponse<{ question: string }>> {
  return apiFetch<{ question: string }>(token, `/api/review/${moduleId}/gate-open`, {
    method: 'POST',
    body: JSON.stringify({ findingId, description, regulatoryRef }),
  });
}

export async function unlockGate(
  token: string,
  findingId: string,
  cognitiveAnswer: string
): Promise<ApiResponse<Record<string, never>>> {
  return apiFetch<Record<string, never>>(token, `/api/review/findings/${findingId}/gate-unlock`, {
    method: 'POST',
    body: JSON.stringify({ cognitiveAnswer }),
  });
}

export async function getAttestation(
  token: string,
  moduleId: string
): Promise<ApiResponse<AttestationRecord>> {
  return apiFetch<AttestationRecord>(token, `/api/review/${moduleId}/attestation`);
}

export async function createAttestation(
  token: string,
  moduleId: string,
  req: {
    reviewerName: string;
    reviewerRole: string;
    basisOfCompetence: string;
    regulatoryFrameworksReviewed: string[];
    explicitAcceptance: string;
    contentHashAtAttestation: string;
  }
): Promise<ApiResponse<AttestationRecord>> {
  return apiFetch<AttestationRecord>(token, `/api/review/${moduleId}/attestation`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ─── Generation (fetch-based SSE) ─────────────────────────────────────────────
// Uses fetch() streaming instead of EventSource — EventSource cannot POST
// or set custom headers, so it cannot handle our auth or config payload.

export interface GenerationStartRequest {
  title: string;
  domainPrompt: string;
  audienceDescription: string;
  objectives: string[];
  sourceReferences: string[];
  // stageCount, lessonsPerStage, missionCount — enforced server-side (MODULE_SHAPE).
  // workplaceContext, regulatoryClassification — loaded from DB (trust boundary).
}

export async function startGenerationStream(
  token: string,
  moduleId: string,
  req: GenerationStartRequest,
  onEvent: (event: JobStepEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_URL}/api/generation/${moduleId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok || !res.body) {
    const raw = await res.text().catch(() => `HTTP ${res.status}`);
    let parsed: { error?: string; runningModuleId?: string } | null = null;
    try { parsed = JSON.parse(raw) as { error?: string; runningModuleId?: string }; } catch { /* noop */ }
    const detail = parsed?.error ?? raw;
    const runHint = parsed?.runningModuleId
      ? ` (active run: ${parsed.runningModuleId})`
      : '';
    throw new Error(`Generation start failed: ${detail}${runHint}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminated = false; // set when job_complete or job_failed event is received

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split on SSE line boundaries and parse events
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6)) as JobStepEvent;
        if (event.event === 'job_complete' || event.event === 'job_failed') {
          terminated = true;
        }
        onEvent(event);
      } catch {
        // Malformed SSE line — skip
      }
    }
  }

  // If the SSE stream ended without a terminal event the connection was dropped
  // mid-generation (e.g. idle-connection kill during a long Anthropic call).
  if (!terminated) {
    const statusError = await resolveGenerationDisconnectStatus(token, moduleId);
    onEvent({ event: 'job_failed', error: statusError });
  }
}

async function resolveGenerationDisconnectStatus(token: string, moduleId: string): Promise<string> {
  // Retry briefly in case the server is still committing failed/completed state.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API_URL}/api/generation/${moduleId}/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const payload = await res.json().catch(() => null) as {
          ok?: boolean;
          data?: { status?: string; error?: string | null; isActive?: boolean };
        } | null;
        const status = payload?.data?.status;
        const error = payload?.data?.error;
        const isActive = payload?.data?.isActive;

        if (status === 'failed') {
          return error?.trim() || 'Generation failed on the server. Check API logs for details.';
        }
        if (status === 'complete') {
          return 'Generation completed on the server, but the stream disconnected before completion reached this browser. Refresh Modules.';
        }
        if (status === 'running' || isActive) {
          return 'Connection lost, but generation is still running on the server. You can resume from Studio or check Modules shortly.';
        }
      }
    } catch {
      // best-effort fallback below
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return 'Connection lost — generation may still be running on the server. Try regenerating.';
}

export async function cancelGeneration(token: string, moduleId: string): Promise<void> {
  await apiFetch(token, `/api/generation/${moduleId}`, { method: 'DELETE' });
}

// ─── Module certificates ──────────────────────────────────────────────────────

export async function generateModuleCert(
  token: string,
  moduleId: string
): Promise<ApiResponse<ModuleCertRecord>> {
  return apiFetch<ModuleCertRecord>(token, `/api/certs/module/${moduleId}`, { method: 'POST' });
}

// ─── Learner delivery ─────────────────────────────────────────────────────────

export async function getLearnerModule(
  token: string,
  moduleId: string
): Promise<ApiResponse<unknown>> {
  return apiFetch<unknown>(token, `/api/learner/modules/${moduleId}`);
}

export async function issueLearnerCert(
  token: string,
  moduleId: string,
  req: {
    learnerName: string;
    learnerUserId: string;
    score: number;
    passThreshold: number;
  }
): Promise<ApiResponse<LearnerCertRecord>> {
  return apiFetch<LearnerCertRecord>(token, `/api/certs/learner/${moduleId}`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function getLearnerCertPdfUrl(certNumber: string): string {
  return `${API_URL}/api/certs/learner/${certNumber}/pdf`;
}

// ─── Audit Pack ──────────────────────────────────────────────────────────────

export async function downloadAuditPack(token: string, moduleId: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/api/audit-pack/${moduleId}/pdf`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.blob();
}

// ─── Learner Progress ─────────────────────────────────────────────────────────

export async function getProgress(
  token: string,
  moduleId: string
): Promise<ApiResponse<{ progress: Record<string, unknown>; score: number | null; completed: boolean } | null>> {
  return apiFetch<{ progress: Record<string, unknown>; score: number | null; completed: boolean } | null>(
    token,
    `/api/learner/progress/${moduleId}`
  );
}

export async function saveProgressToServer(
  token: string,
  moduleId: string,
  body: { progress: object; score?: number; completed?: boolean }
): Promise<ApiResponse<{ id: string }>> {
  return apiFetch<{ id: string }>(token, `/api/learner/progress/${moduleId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ─── Verbal Responses ─────────────────────────────────────────────────────────

export async function submitVerbalResponse(
  token: string,
  params: { moduleId: string; lessonId: string; questionId: string },
  body: {
    audioBase64?: string;
    mimeType?: string;
    durationMs?: number;
    answered: boolean;
    questionPrompt: string;
    regulatoryRef?: string;
    timerSeconds: number;
    expectedKeywords?: string[];
    minKeywordHits?: number;
  }
): Promise<ApiResponse<{ id: string; status: string }>> {
  return apiFetch<{ id: string; status: string }>(
    token,
    `/api/verbal/${params.moduleId}/${params.lessonId}/${params.questionId}`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export async function listVerbalResponses(
  token: string,
  opts: { moduleId?: string; disposition?: string } = {}
): Promise<ApiResponse<VerbalResponseRecord[]>> {
  const qs = new URLSearchParams();
  if (opts.moduleId)    qs.set('moduleId', opts.moduleId);
  if (opts.disposition) qs.set('disposition', opts.disposition);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<VerbalResponseRecord[]>(token, `/api/verbal${query}`);
}

export async function disposeVerbalResponse(
  token: string,
  id: string,
  body: { disposition: 'confirmed' | 'flagged'; note?: string }
): Promise<ApiResponse<{ id: string; disposition: string }>> {
  return apiFetch<{ id: string; disposition: string }>(
    token,
    `/api/verbal/${id}/disposition`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

// ─── SOP API ──────────────────────────────────────────────────────────────────

export async function listSops(token: string): Promise<ApiResponse<SopRecord[]>> {
  return apiFetch<SopRecord[]>(token, '/api/sops');
}

export async function getSop(token: string, sopId: string): Promise<ApiResponse<{ sop: SopRecord; sourceDocs: SopSourceDocRecord[] }>> {
  return apiFetch<{ sop: SopRecord; sourceDocs: SopSourceDocRecord[] }>(token, `/api/sops/${sopId}`);
}

export async function createSop(
  token: string,
  body: {
    title: string;
    procedureName: string;
    equipment: string;
    moduleId?: string;
    workplaceContext: WorkplaceContextDTO | object;
    regulatoryClassification: ClassificationSummaryDTO | object;
  }
): Promise<ApiResponse<SopRecord>> {
  return apiFetch<SopRecord>(token, '/api/sops', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteSop(token: string, sopId: string): Promise<ApiResponse<{ deleted: true }>> {
  return apiFetch<{ deleted: true }>(token, `/api/sops/${sopId}`, { method: 'DELETE' });
}

/**
 * Batch-create SOP records — all sharing the same workplace context and
 * regulatory classification. Each SOP is returned as a draft record; source
 * documents must be uploaded and generation triggered per-SOP afterwards.
 *
 * Hidden feature: only callable when FEATURES.BATCH_SOPS is enabled.
 * Backend endpoint is always active regardless of frontend flag state.
 */
export async function batchCreateSops(
  token: string,
  body: {
    moduleId?: string;
    workplaceContext: Record<string, unknown>;
    regulatoryClassification: Record<string, unknown>;
    procedures: Array<{ title: string; procedureName: string; equipment: string }>;
  }
): Promise<ApiResponse<{ sops: SopRecord[] }>> {
  return apiFetch<{ sops: SopRecord[] }>(token, '/api/sops/batch', { method: 'POST', body: JSON.stringify(body) });
}

export async function uploadSopSourceDocument(
  token: string,
  sopId: string,
  file: File,
  docType: string,
): Promise<ApiResponse<SopSourceDocRecord>> {
  const form = new FormData();
  form.append('file', file);
  form.append('docType', docType);
  const res = await fetch(`${API_URL}/api/sops/${sopId}/source-documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json() as Promise<ApiResponse<SopSourceDocRecord>>;
}

export async function getSopGenerationStatus(token: string, sopId: string): Promise<ApiResponse<unknown>> {
  return apiFetch<unknown>(token, `/api/sop-generation/${sopId}/status`);
}

export function startSopGenerationStream(
  token: string,
  sopId: string,
  onEvent: (event: JobStepEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(`${API_URL}/api/sop-generation/${sopId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) { reject(new Error('SOP generation failed to start')); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try { onEvent(JSON.parse(line.slice(6)) as JobStepEvent); } catch { /* ignore */ }
          }
        }
      }
      resolve();
    }).catch(reject);
  });
}

export async function getSopFindings(token: string, sopId: string): Promise<ApiResponse<SopReviewFinding[]>> {
  return apiFetch<SopReviewFinding[]>(token, `/api/sop-review/${sopId}/findings`);
}

export async function createSopFinding(
  token: string,
  sopId: string,
  body: Omit<SopReviewFinding, 'id' | 'sopId' | 'createdAt' | 'disposition' | 'dispositionRationale' | 'disposedBy' | 'disposedAt'>
): Promise<ApiResponse<SopReviewFinding>> {
  return apiFetch<SopReviewFinding>(token, `/api/sop-review/${sopId}/findings`, { method: 'POST', body: JSON.stringify(body) });
}

export async function disposeSopFinding(
  token: string,
  findingId: string,
  body: { disposition: 'accepted' | 'amended' | 'escalated'; rationale: string }
): Promise<ApiResponse<SopReviewFinding>> {
  return apiFetch<SopReviewFinding>(token, `/api/sop-review/findings/${findingId}/disposition`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function seedSopFindings(token: string, sopId: string): Promise<ApiResponse<{ seeded: number }>> {
  return apiFetch<{ seeded: number }>(token, `/api/sop-review/${sopId}/seed-findings`, { method: 'POST' });
}

export async function getSopAttestation(token: string, sopId: string): Promise<ApiResponse<SopAttestationRecord | null>> {
  return apiFetch<SopAttestationRecord | null>(token, `/api/sop-review/${sopId}/attestation`);
}

export async function createSopAttestation(
  token: string,
  sopId: string,
  body: Omit<SopAttestationRecord, 'id' | 'sopId' | 'reviewerUserId' | 'attestedAt'>
): Promise<ApiResponse<SopAttestationRecord>> {
  return apiFetch<SopAttestationRecord>(token, `/api/sop-review/${sopId}/attestation`, { method: 'POST', body: JSON.stringify(body) });
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function listMembers(token: string): Promise<ApiResponse<OrgMemberRecord[]>> {
  return apiFetch<OrgMemberRecord[]>(token, '/api/members');
}

export async function inviteMembers(
  token: string,
  invites: Array<{ email: string; name: string; role: OrgRole }>
): Promise<ApiResponse<{ invited: number; errors: string[] }>> {
  return apiFetch(token, '/api/members/invite', { method: 'POST', body: JSON.stringify({ invites }) });
}

export async function updateMember(
  token: string,
  memberId: string,
  body: { role?: OrgRole; jobTitle?: string; department?: string }
): Promise<ApiResponse<OrgMemberRecord>> {
  return apiFetch<OrgMemberRecord>(token, `/api/members/${memberId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function suspendMember(token: string, memberId: string): Promise<ApiResponse<OrgMemberRecord>> {
  return apiFetch<OrgMemberRecord>(token, `/api/members/${memberId}/suspend`, { method: 'PATCH' });
}

export async function removeMember(token: string, memberId: string): Promise<ApiResponse<{ deleted: boolean }>> {
  return apiFetch(token, `/api/members/${memberId}`, { method: 'DELETE' });
}

export async function syncMembers(token: string): Promise<ApiResponse<{ synced: number }>> {
  return apiFetch(token, '/api/members/sync', { method: 'POST' });
}

// ─── Org Profile ─────────────────────────────────────────────────────────────

export async function updateOrgProfile(
  token: string,
  body: { industry?: string; workforceSize?: string }
): Promise<ApiResponse<OrgRecord>> {
  return apiFetch<OrgRecord>(token, '/api/orgs/me/profile', { method: 'PATCH', body: JSON.stringify(body) });
}

export async function completeOnboarding(token: string): Promise<ApiResponse<{ completed: boolean }>> {
  return apiFetch(token, '/api/orgs/me/onboarding-complete', { method: 'POST' });
}

// ─── Governance (v2 — generic for all content types) ────────────────────────

export async function listGovernedFindings(
  token: string, registryId: string
): Promise<ApiResponse<GovernedFinding[]>> {
  return apiFetch<GovernedFinding[]>(token, `/api/governance/${registryId}/findings`);
}

export async function createGovernedFinding(
  token: string,
  registryId: string,
  body: {
    severity: string; category: string; description: string;
    location: string; regulatoryRef?: string; sourceAttribution?: string;
  }
): Promise<ApiResponse<GovernedFinding>> {
  return apiFetch<GovernedFinding>(token, `/api/governance/${registryId}/findings`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

export async function disposeGovernedFinding(
  token: string,
  findingId: string,
  body: { disposition: string; rationale: string }
): Promise<ApiResponse<GovernedFinding>> {
  return apiFetch<GovernedFinding>(token, `/api/governance/findings/${findingId}/disposition`, {
    method: 'PATCH', body: JSON.stringify(body),
  });
}

export async function logGovernedGateOpen(token: string, findingId: string): Promise<ApiResponse<{ logged: true }>> {
  return apiFetch<{ logged: true }>(token, `/api/governance/findings/${findingId}/gate-open`, { method: 'POST' });
}

export async function logGovernedGateUnlock(
  token: string,
  findingId: string,
  body: { answer: string; timerDuration: number }
): Promise<ApiResponse<{ logged: true }>> {
  return apiFetch<{ logged: true }>(token, `/api/governance/findings/${findingId}/gate-unlock`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

export async function seedGovernedFindings(
  token: string, registryId: string
): Promise<ApiResponse<{ created: number; skipped: number }>> {
  return apiFetch(token, `/api/governance/${registryId}/seed-findings`, { method: 'POST' });
}

export async function getGovernedAttestation(
  token: string, registryId: string
): Promise<ApiResponse<GovernedAttestation | null>> {
  return apiFetch<GovernedAttestation | null>(token, `/api/governance/${registryId}/attestation`);
}

export async function createGovernedAttestation(
  token: string,
  registryId: string,
  body: {
    reviewerName: string; reviewerRole: string; basisOfCompetence: string;
    regulatoryFrameworksReviewed: string[]; explicitAcceptance: string;
    contentHashAtAttestation: string;
  }
): Promise<ApiResponse<GovernedAttestation>> {
  return apiFetch<GovernedAttestation>(token, `/api/governance/${registryId}/attestation`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

export async function issueGovernedCertificate(
  token: string, registryId: string
): Promise<ApiResponse<GovernedCertificate>> {
  return apiFetch<GovernedCertificate>(token, `/api/governance/${registryId}/certificate`, { method: 'POST' });
}

// ─── RAMS ────────────────────────────────────────────────────────────────────

export async function listRams(token: string): Promise<ApiResponse<RamsRecord[]>> {
  return apiFetch<RamsRecord[]>(token, '/api/rams');
}

export async function getRams(
  token: string, ramsId: string
): Promise<ApiResponse<{ rams: RamsRecord; sourceDocs: RamsSourceDocRecord[] }>> {
  return apiFetch(token, `/api/rams/${ramsId}`);
}

export async function createRams(
  token: string,
  body: {
    title: string; taskDescription: string; location?: string;
    equipment?: string[]; workplaceContext: WorkplaceContextDTO | object;
    regulatoryClassification: ClassificationSummaryDTO | object;
  }
): Promise<ApiResponse<RamsRecord & { registryId: string }>> {
  return apiFetch(token, '/api/rams', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteRams(token: string, ramsId: string): Promise<ApiResponse<{ deleted: true }>> {
  return apiFetch(token, `/api/rams/${ramsId}`, { method: 'DELETE' });
}

export async function uploadRamsSourceDoc(
  token: string, ramsId: string, file: File, docType: string
): Promise<ApiResponse<RamsSourceDocRecord>> {
  const form = new FormData();
  form.append('file', file);
  form.append('docType', docType);
  const res = await fetch(`${API_URL}/api/rams/${ramsId}/source-documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json() as Promise<ApiResponse<RamsSourceDocRecord>>;
}

export async function getRamsGenerationStatus(
  token: string, ramsId: string
): Promise<ApiResponse<{ status: string; job: unknown; error?: string; isActive: boolean }>> {
  return apiFetch(token, `/api/rams-generation/${ramsId}/status`);
}

export async function cancelRamsGeneration(
  token: string, ramsId: string
): Promise<ApiResponse<{ cancelled: true }>> {
  return apiFetch(token, `/api/rams-generation/${ramsId}`, { method: 'DELETE' });
}

export function startRamsGenerationSSE(
  token: string,
  ramsId: string,
  onEvent: (event: JobStepEvent) => void,
  onError: (error: string) => void,
  onComplete: () => void,
): () => void {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3001';
  const url = `${apiBase}/api/rams-generation/${ramsId}/start`;

  const controller = new AbortController();

  fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        onError(text || `HTTP ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const read = async () => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) { onComplete(); break; }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as JobStepEvent;
                onEvent(event);
                if (event.event === 'job_complete') onComplete();
                if (event.event === 'job_failed') onError(event.error ?? 'Generation failed');
              } catch { /* skip malformed */ }
            }
          }
        }
      };
      await read();
    })
    .catch((err) => {
      if (!controller.signal.aborted) onError(err instanceof Error ? err.message : String(err));
    });

  return () => controller.abort();
}

// ─── Module version history ──────────────────────────────────────────────────

export async function listModuleVersions(
  token: string,
  moduleId: string,
): Promise<ApiResponse<ModuleSnapshotSummary[]>> {
  return apiFetch<ModuleSnapshotSummary[]>(token, `/api/module-versions/${moduleId}/versions`);
}

export async function getModuleSnapshot(
  token: string,
  moduleId: string,
  version: number,
): Promise<ApiResponse<ModuleSnapshotFull>> {
  return apiFetch<ModuleSnapshotFull>(token, `/api/module-versions/${moduleId}/versions/${version}`);
}

export async function getSnapshotDiff(
  token: string,
  moduleId: string,
  v1: number,
  v2: number,
): Promise<ApiResponse<SnapshotDiffEntry[]>> {
  return apiFetch<SnapshotDiffEntry[]>(token, `/api/module-versions/${moduleId}/diff/${v1}/${v2}`);
}
