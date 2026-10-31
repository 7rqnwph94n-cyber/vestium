import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Re-declare schemas exactly as they appear in route files ─────────────────
// These are tested in isolation to verify input validation behavior.
// If schemas are later exported from routes, these can be replaced with imports.

const AuditQuerySchema = z.object({
  moduleId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const StartGenerationSchema = z.object({
  title: z.string().min(1),
  domainPrompt: z.string().min(1),
  audienceDescription: z.string().min(1),
  objectives: z.array(z.string()).min(1),
  sourceReferences: z.array(z.string()).default([]),
  // stageCount, lessonsPerStage, missionCount — enforced by MODULE_SHAPE constant.
  // workplaceContext + regulatoryClassification — loaded from DB (trust boundary).
});

const CreateFindingSchema = z.object({
  severity: z.enum(['regulatory', 'high', 'medium', 'low']),
  category: z.enum(['A', 'B']),
  description: z.string().min(1),
  location: z.string().min(1),
  regulatoryRef: z.string().optional(),
});

const DisposeFindingSchema = z.object({
  disposition: z.enum(['accepted', 'amended', 'escalated']),
  rationale: z.string().min(5),
});

const CreateAttestationSchema = z.object({
  reviewerName: z.string().min(1),
  reviewerRole: z.string().min(1),
  basisOfCompetence: z.string().min(1),
  regulatoryFrameworksReviewed: z.array(z.string().min(1)).min(1),
  explicitAcceptance: z.string().min(1),
  contentHashAtAttestation: z.string().min(1),
});

// ─── AuditQuerySchema ─────────────────────────────────────────────────────────

describe('AuditQuerySchema', () => {
  it('accepts valid query params', () => {
    const result = AuditQuerySchema.safeParse({ limit: '25', offset: '10', moduleId: 'abc' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.offset).toBe(10);
      expect(result.data.moduleId).toBe('abc');
    }
  });

  it('provides defaults when no params given', () => {
    const result = AuditQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(0);
      expect(result.data.moduleId).toBeUndefined();
    }
  });

  it('rejects non-numeric limit (NaN protection)', () => {
    const result = AuditQuerySchema.safeParse({ limit: 'abc' });
    expect(result.success).toBe(false);
  });

  it('clamps limit to max 200', () => {
    const result = AuditQuerySchema.safeParse({ limit: '999' });
    expect(result.success).toBe(false);
  });

  it('rejects negative offset', () => {
    const result = AuditQuerySchema.safeParse({ offset: '-1' });
    expect(result.success).toBe(false);
  });

  it('rejects zero limit', () => {
    const result = AuditQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });
});

// ─── StartGenerationSchema ────────────────────────────────────────────────────

describe('StartGenerationSchema', () => {
  const validPayload = {
    title: 'Welding Safety',
    domainPrompt: 'Arc welding in industrial settings',
    audienceDescription: 'New welding apprentices',
    objectives: ['Understand PPE requirements'],
  };

  it('accepts a valid minimal payload', () => {
    const result = StartGenerationSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceReferences).toEqual([]); // default
    }
  });

  it('rejects empty title', () => {
    const result = StartGenerationSchema.safeParse({ ...validPayload, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty objectives array', () => {
    const result = StartGenerationSchema.safeParse({ ...validPayload, objectives: [] });
    expect(result.success).toBe(false);
  });

  it('ignores extra client fields (counts + context stripped)', () => {
    // stageCount, lessonsPerStage, missionCount are enforced server-side.
    // workplaceContext + regulatoryClassification are loaded from DB.
    // Extra fields should be silently stripped by Zod (passthrough not set).
    const withExtras = {
      ...validPayload,
      stageCount: 4,
      lessonsPerStage: 3,
      missionCount: 5,
      workplaceContext: { industryType: 'welding' },
      regulatoryClassification: { primarySchemaId: 'mhswr' },
    };
    const result = StartGenerationSchema.safeParse(withExtras);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.stageCount).toBeUndefined();
      expect(data.lessonsPerStage).toBeUndefined();
      expect(data.missionCount).toBeUndefined();
      expect(data.workplaceContext).toBeUndefined();
      expect(data.regulatoryClassification).toBeUndefined();
    }
  });
});

// ─── CreateFindingSchema ──────────────────────────────────────────────────────

describe('CreateFindingSchema', () => {
  it('accepts a valid finding', () => {
    const result = CreateFindingSchema.safeParse({
      severity: 'regulatory',
      category: 'A',
      description: 'Incorrect PPE guidance',
      location: 'Stage 2, Lesson 1',
      regulatoryRef: 'MHSWR 1999 Reg 3(1)',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid severity', () => {
    const result = CreateFindingSchema.safeParse({
      severity: 'critical',
      category: 'A',
      description: 'x',
      location: 'y',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = CreateFindingSchema.safeParse({
      severity: 'low',
      category: 'B',
      description: '',
      location: 'Stage 1',
    });
    expect(result.success).toBe(false);
  });
});

// ─── DisposeFindingSchema ─────────────────────────────────────────────────────

describe('DisposeFindingSchema', () => {
  it('accepts valid disposition', () => {
    const result = DisposeFindingSchema.safeParse({
      disposition: 'accepted',
      rationale: 'Content is accurate per SME review',
    });
    expect(result.success).toBe(true);
  });

  it('rejects rationale < 5 chars', () => {
    const result = DisposeFindingSchema.safeParse({
      disposition: 'accepted',
      rationale: 'ok',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid disposition value', () => {
    const result = DisposeFindingSchema.safeParse({
      disposition: 'rejected',
      rationale: 'This is a valid rationale',
    });
    expect(result.success).toBe(false);
  });
});

// ─── CreateAttestationSchema ──────────────────────────────────────────────────

describe('CreateAttestationSchema', () => {
  it('accepts valid attestation', () => {
    const result = CreateAttestationSchema.safeParse({
      reviewerName: 'Jane Smith',
      reviewerRole: 'Senior Safety Advisor',
      basisOfCompetence: 'NEBOSH Diploma holder with 10 years experience',
      regulatoryFrameworksReviewed: ['MHSWR 1999', 'COSHH 2002'],
      explicitAcceptance: 'I confirm this content is safe for use',
      contentHashAtAttestation: 'sha256:abc123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty frameworks array', () => {
    const result = CreateAttestationSchema.safeParse({
      reviewerName: 'Jane',
      reviewerRole: 'Advisor',
      basisOfCompetence: 'Qualified',
      regulatoryFrameworksReviewed: [],
      explicitAcceptance: 'I accept',
      contentHashAtAttestation: 'sha256:abc123',
    });
    expect(result.success).toBe(false);
  });
});
