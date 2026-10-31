// ─── RAMS Job State Mapper ───────────────────────────────────────────────────
// Extracts registryId and draft from the raw generation job state (typed as
// `unknown` from the API). All unsafe property traversal happens here.

// ─── View model ─────────────────────────────────────────────────────────────

export interface RamsJobStateViewModel {
  registryId: string | null;
  /** The parsed RAMS draft build, if present. Consumer narrows to its own RamsDraft type. */
  draft: unknown;
}

// ─── Mapper ─────────────────────────────────────────────────────────────────

export function mapRamsJobState(job: unknown): RamsJobStateViewModel {
  if (!job || typeof job !== 'object') {
    return { registryId: null, draft: null };
  }

  const obj = job as Record<string, unknown>;

  const registryId = typeof obj.registryId === 'string' ? obj.registryId : null;

  let draft: unknown = null;
  const steps = obj.steps;
  if (steps && typeof steps === 'object') {
    const stepsRec = steps as Record<string, unknown>;
    const ramsBuild = stepsRec.ramsDraftBuild;
    if (ramsBuild && typeof ramsBuild === 'object') {
      const buildRec = ramsBuild as Record<string, unknown>;
      const parsed = buildRec.parsedJson;
      if (parsed && typeof parsed === 'object') {
        const parsedRec = parsed as Record<string, unknown>;
        draft = parsedRec.ramsDraftBuild ?? null;
      }
    }
  }

  return { registryId, draft };
}
