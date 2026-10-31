import { describe, expect, it } from 'vitest';
import type { ModuleRecord } from '@complianceforge/types';
import { filterVisibleOrgModules } from './ModulesPage';

function mod(partial: Partial<ModuleRecord>): ModuleRecord {
  return {
    id: 'm',
    orgId: 'o',
    title: 't',
    status: 'draft',
    workplaceContext: {} as ModuleRecord['workplaceContext'],
    regulatoryClassification: {} as ModuleRecord['regulatoryClassification'],
    generationMetadata: {} as unknown as ModuleRecord['generationMetadata'],
    createdAt: '2026-03-05T00:00:00.000Z',
    updatedAt: '2026-03-05T00:00:00.000Z',
    ...partial,
  };
}

describe('filterVisibleOrgModules', () => {
  it('excludes in_review modules but keeps deployed/stale and failed drafts', () => {
    const input: ModuleRecord[] = [
      mod({ id: 'a', title: 'In review', status: 'in_review' }),
      mod({ id: 'b', title: 'Deployed', status: 'deployed' }),
      mod({ id: 'c', title: 'Stale', status: 'stale' }),
      mod({ id: 'd', title: 'Draft failed', status: 'draft', generationMetadata: { failed: true } as unknown as ModuleRecord['generationMetadata'] }),
      mod({ id: 'e', title: 'Draft pending', status: 'draft', generationMetadata: {} as unknown as ModuleRecord['generationMetadata'] }),
    ];

    const output = filterVisibleOrgModules(input);
    const ids = output.map((m) => m.id);

    expect(ids).toEqual(['b', 'c', 'd']);
  });
});

