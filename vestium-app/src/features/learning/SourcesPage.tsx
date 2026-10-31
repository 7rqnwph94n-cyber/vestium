import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useTheme } from '../../lib/training-core/ThemeContext';

type MediaCredit = {
  stageId: number;
  lessonId: string;
  lessonTitle: string;
  diagramTitle: string;
  sourceName: string;
  sourceUrl: string;
  creator?: string;
  licenseName: string;
  licenseUrl?: string;
  rightsStatus?: 'public-domain' | 'cc0' | 'other';
  verifiedOn?: string;
  verificationNotes?: string;
};

type SourceEntry = {
  id: string;
  title: string;
  url: string;
  notes?: string;
  publisher?: string;
  reliability?: 'authoritative' | 'reputable' | 'secondary';
  year?: number;
  lastVerified?: string;
};

type CitationMap = {
  lessonCitations: Record<string, string[]>;
  missionCitations: Record<string, string[]>;
};

type RegAppearance = {
  stageId: number;
  stageTitle: string;
  lessonId?: string;
  lessonTitle?: string;
  kind: 'lesson-quiz' | 'stage-test';
};

// Known UK H&S legislation → legislation.gov.uk base URLs
// Pattern match on common abbreviation prefixes
const LEGISLATION_URLS: Array<{ match: RegExp; url: string; fullTitle: string }> = [
  {
    match: /\bMHSWR\b/i,
    url: 'https://www.legislation.gov.uk/uksi/1999/3242/contents',
    fullTitle: 'Management of Health and Safety at Work Regulations 1999 (SI 1999/3242)'
  },
  {
    match: /\bCOSHH\b/i,
    url: 'https://www.legislation.gov.uk/uksi/2002/2677/contents',
    fullTitle: 'Control of Substances Hazardous to Health Regulations 2002 (SI 2002/2677)'
  },
  {
    match: /\bPUWER\b/i,
    url: 'https://www.legislation.gov.uk/uksi/1998/2306/contents',
    fullTitle: 'Provision and Use of Work Equipment Regulations 1998 (SI 1998/2306)'
  },
  {
    match: /\bLOLER\b/i,
    url: 'https://www.legislation.gov.uk/uksi/1998/2307/contents',
    fullTitle: 'Lifting Operations and Lifting Equipment Regulations 1998 (SI 1998/2307)'
  },
  {
    match: /\bManual Handling\b/i,
    url: 'https://www.legislation.gov.uk/uksi/1992/2793/contents',
    fullTitle: 'Manual Handling Operations Regulations 1992 (SI 1992/2793)'
  },
  {
    match: /\bDSAR\b|\bDSE\b/i,
    url: 'https://www.legislation.gov.uk/uksi/1992/2792/contents',
    fullTitle: 'Health and Safety (Display Screen Equipment) Regulations 1992 (SI 1992/2792)'
  },
  {
    match: /\bNoise\b.*Reg/i,
    url: 'https://www.legislation.gov.uk/uksi/2005/1643/contents',
    fullTitle: 'Control of Noise at Work Regulations 2005 (SI 2005/1643)'
  },
  {
    match: /\bVibration\b.*Reg/i,
    url: 'https://www.legislation.gov.uk/uksi/2005/1093/contents',
    fullTitle: 'Control of Vibration at Work Regulations 2005 (SI 2005/1093)'
  },
  {
    match: /\bElectricity at Work\b/i,
    url: 'https://www.legislation.gov.uk/uksi/1989/635/contents',
    fullTitle: 'Electricity at Work Regulations 1989 (SI 1989/635)'
  },
  {
    match: /\bDSEAR\b/i,
    url: 'https://www.legislation.gov.uk/uksi/2002/2776/contents',
    fullTitle: 'Dangerous Substances and Explosive Atmospheres Regulations 2002 (SI 2002/2776)'
  },
  {
    match: /\bControl of Asbestos\b/i,
    url: 'https://www.legislation.gov.uk/uksi/2012/632/contents',
    fullTitle: 'Control of Asbestos Regulations 2012 (SI 2012/632)'
  },
  {
    match: /\bCDM\b/i,
    url: 'https://www.legislation.gov.uk/uksi/2015/51/contents',
    fullTitle: 'Construction (Design and Management) Regulations 2015 (SI 2015/51)'
  },
  {
    match: /\bHealth and Safety at Work.*Act\b|\bHSWA\b|\bHASAWA\b/i,
    url: 'https://www.legislation.gov.uk/ukpga/1974/37/contents',
    fullTitle: 'Health and Safety at Work etc. Act 1974 (c.37)'
  },
  {
    match: /\bRIDDOR\b/i,
    url: 'https://www.legislation.gov.uk/uksi/2013/1471/contents',
    fullTitle: 'Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013 (SI 2013/1471)'
  },
  {
    match: /\bWork at Height\b/i,
    url: 'https://www.legislation.gov.uk/uksi/2005/735/contents',
    fullTitle: 'Work at Height Regulations 2005 (SI 2005/735)'
  },
  {
    match: /\bConfined Spaces\b/i,
    url: 'https://www.legislation.gov.uk/uksi/1997/1713/contents',
    fullTitle: 'Confined Spaces Regulations 1997 (SI 1997/1713)'
  }
];

const getLegislationInfo = (ref: string): { url: string; fullTitle: string } | null => {
  for (const entry of LEGISLATION_URLS) {
    if (entry.match.test(ref)) {
      return { url: entry.url, fullTitle: entry.fullTitle };
    }
  }
  return null;
};

const RELIABILITY_LABEL: Record<string, string> = {
  authoritative: 'Authoritative',
  reputable: 'Reputable',
  secondary: 'Secondary'
};

const RELIABILITY_COLOR: Record<string, string> = {
  authoritative: 'text-emerald-300',
  reputable: 'text-amber-300',
  secondary: 'text-theme-secondary'
};

export const SourcesPage = () => {
  const { currentTheme } = useTheme();

  // ─── Regulatory citations from question regulatoryRef fields ───────────────
  // Scan all lesson quizzes and stage tests for regulatoryRef annotations
  const refMap = new Map<string, RegAppearance[]>();

  for (const stage of currentTheme.curriculum) {
    for (const lesson of stage.lessons) {
      for (const q of lesson.quiz) {
        if (q.regulatoryRef) {
          const existing = refMap.get(q.regulatoryRef) ?? [];
          // Only add one appearance per lesson (de-duplicate within same lesson)
          if (!existing.some((a) => a.lessonId === lesson.id)) {
            existing.push({ stageId: stage.id, stageTitle: stage.title, lessonId: lesson.id, lessonTitle: lesson.title, kind: 'lesson-quiz' });
          }
          refMap.set(q.regulatoryRef, existing);
        }
      }
    }
    for (const q of stage.test) {
      if (q.regulatoryRef) {
        const existing = refMap.get(q.regulatoryRef) ?? [];
        if (!existing.some((a) => a.kind === 'stage-test' && a.stageId === stage.id)) {
          existing.push({ stageId: stage.id, stageTitle: stage.title, kind: 'stage-test' });
        }
        refMap.set(q.regulatoryRef, existing);
      }
    }
  }

  // Sort: alphabetically by ref
  const regulatoryRefs = [...refMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ref, appearances]) => ({ ref, appearances, legislationInfo: getLegislationInfo(ref) }));

  // ─── Source catalog from pipeline attribution step ─────────────────────────
  const sourceCatalog = (currentTheme.simulatorData?.sourceCatalog ?? []) as SourceEntry[];
  const citationMap = (currentTheme.simulatorData?.citationMap ?? null) as CitationMap | null;

  // Build citation count per source
  const sourceCitationCounts: Record<string, number> = {};
  if (citationMap) {
    for (const sourceIds of Object.values(citationMap.lessonCitations)) {
      for (const id of sourceIds) {
        sourceCitationCounts[id] = (sourceCitationCounts[id] ?? 0) + 1;
      }
    }
    for (const sourceIds of Object.values(citationMap.missionCitations)) {
      for (const id of sourceIds) {
        sourceCitationCounts[id] = (sourceCitationCounts[id] ?? 0) + 1;
      }
    }
  }

  // Sort: authoritative first, then reputable, then secondary
  const sortedSources = [...sourceCatalog].sort((a, b) => {
    const order = { authoritative: 0, reputable: 1, secondary: 2 };
    const aOrder = order[(a.reliability ?? 'secondary') as keyof typeof order] ?? 2;
    const bOrder = order[(b.reliability ?? 'secondary') as keyof typeof order] ?? 2;
    return aOrder - bOrder;
  });

  // ─── Media credits from lesson diagrams ────────────────────────────────────
  const embeddedMediaCredits: MediaCredit[] = currentTheme.curriculum.flatMap((stage) =>
    stage.lessons.flatMap((lesson) =>
      lesson.diagrams
        .filter((diagram) => diagram.kind === 'image' && diagram.attribution)
        .map((diagram) => ({
          stageId: stage.id,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          diagramTitle: diagram.title,
          sourceName: diagram.attribution!.sourceName,
          sourceUrl: diagram.attribution!.sourceUrl,
          creator: diagram.attribution!.creator,
          licenseName: diagram.attribution!.licenseName,
          licenseUrl: diagram.attribution!.licenseUrl,
          rightsStatus: diagram.attribution!.rightsStatus,
          verifiedOn: diagram.attribution!.verifiedOn,
          verificationNotes: diagram.attribution!.verificationNotes
        }))
    )
  );

  const uniqueEmbeddedMediaCredits = Array.from(
    new Map(embeddedMediaCredits.map((item) => [item.sourceUrl, item])).values()
  );

  return (
    <div className="space-y-4">
      <Card title={currentTheme.labels?.sourcesTitle ?? 'Legislation & Regulatory References'}>
        <div className="space-y-2 text-sm text-theme-secondary">
          <p>
            All regulatory citations, authoritative sources, and references used in this training
            module — extracted from every quiz question and assessment. Use these to verify quiz
            answers and assessment criteria against the source legislation.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-theme-secondary">
            {regulatoryRefs.length > 0 ? (
              <span className="rounded border border-theme-border bg-theme-panel px-2 py-1">
                {regulatoryRefs.length} regulation{regulatoryRefs.length !== 1 ? 's' : ''} cited
              </span>
            ) : null}
            {sortedSources.length > 0 ? (
              <span className="rounded border border-theme-border bg-theme-panel px-2 py-1">
                {sortedSources.length} authoritative source{sortedSources.length !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      {/* ─── Regulatory Duties Referenced ──────────────────────────────────── */}
      {regulatoryRefs.length > 0 ? (
        <Card title="Regulatory Duties Referenced in Assessments">
          <p className="mb-3 text-xs text-theme-secondary">
            Every regulatory citation from quiz questions and stage tests — extracted verbatim
            from the assessment items. Click a legislation link to view the full statute on
            legislation.gov.uk.
          </p>
          <div className="space-y-3">
            {regulatoryRefs.map(({ ref, appearances, legislationInfo }) => (
              <div
                key={ref}
                className="rounded border border-theme-border bg-theme-base p-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-amber-200">{ref}</p>
                  <span className="rounded bg-theme-surface px-1.5 py-0.5 text-[10px] text-theme-secondary shrink-0">
                    {appearances.length} appearance{appearances.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Legislation.gov.uk link if we know the statute */}
                {legislationInfo ? (
                  <div className="mt-1">
                    <p className="text-theme-muted text-[11px]">{legislationInfo.fullTitle}</p>
                    <a
                      href={legislationInfo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-300 hover:text-amber-200 underline text-[11px]"
                    >
                      View on legislation.gov.uk ↗
                    </a>
                  </div>
                ) : (
                  <a
                    href={`https://www.legislation.gov.uk/search?text=${encodeURIComponent(ref)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-theme-muted hover:text-theme-secondary underline text-[11px]"
                  >
                    Search legislation.gov.uk ↗
                  </a>
                )}

                {/* Where it appears */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {appearances.map((a, i) => (
                    <span
                      key={i}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        a.kind === 'stage-test'
                          ? 'border border-rose-500/30 bg-rose-500/5 text-rose-300'
                          : 'border border-sky-500/30 bg-sky-500/5 text-sky-300'
                      }`}
                    >
                      {a.kind === 'stage-test'
                        ? `Stage ${a.stageId} test`
                        : `S${a.stageId}: ${a.lessonTitle ?? a.lessonId}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ─── Regulatory & Technical Source Catalog ─────────────────────────── */}
      {sortedSources.length > 0 ? (
        <Card title="Cited Sources & Guidance">
          <p className="mb-3 text-xs text-theme-secondary">
            Authoritative sources, HSE guidance, and ACOPs cited during module generation.
            Authoritative sources listed first.
          </p>
          <div className="space-y-3">
            {sortedSources.map((src) => {
              const count = sourceCitationCounts[src.id] ?? 0;
              const reliabilityLabel = RELIABILITY_LABEL[src.reliability ?? ''] ?? 'Source';
              const reliabilityColor = RELIABILITY_COLOR[src.reliability ?? ''] ?? 'text-theme-secondary';
              return (
                <div
                  key={src.id}
                  className="rounded border border-theme-border bg-theme-base p-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-theme-text">{src.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`uppercase tracking-wide text-[10px] font-semibold ${reliabilityColor}`}>
                        {reliabilityLabel}
                      </span>
                      {count > 0 ? (
                        <span className="rounded bg-theme-surface px-1.5 py-0.5 text-[10px] text-theme-secondary">
                          {count} citation{count !== 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {src.publisher ? (
                    <p className="mt-1 text-theme-secondary">Publisher: {src.publisher}</p>
                  ) : null}
                  {src.year ? (
                    <p className="text-theme-secondary">Year: {src.year}</p>
                  ) : null}
                  {src.notes ? (
                    <p className="mt-1 text-theme-secondary">{src.notes}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {src.url ? (
                      <a
                        href={src.url}
                        className="text-amber-300 hover:text-amber-200 underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        View source ↗
                      </a>
                    ) : null}
                    {src.lastVerified ? (
                      <span className="text-theme-muted">Verified: {src.lastVerified}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* ─── Citation Map by Lesson ─────────────────────────────────────────── */}
      {citationMap && Object.keys(citationMap.lessonCitations).length > 0 ? (
        <Card title="Sources by Lesson">
          <p className="mb-3 text-xs text-theme-secondary">
            Which sources underpin each lesson — cross-reference quiz answers against cited
            guidance documents.
          </p>
          <div className="space-y-2">
            {currentTheme.curriculum.flatMap((stage) =>
              stage.lessons
                .filter((lesson) => (citationMap.lessonCitations[lesson.id]?.length ?? 0) > 0)
                .map((lesson) => {
                  const citedIds = citationMap.lessonCitations[lesson.id] ?? [];
                  const citedSources = citedIds
                    .map((id) => sourceCatalog.find((s) => s.id === id))
                    .filter(Boolean) as SourceEntry[];
                  return (
                    <div
                      key={lesson.id}
                      className="rounded border border-theme-border bg-theme-base p-3 text-xs"
                    >
                      <p className="font-semibold text-theme-text">
                        Stage {stage.id} — {lesson.title}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {citedSources.length > 0
                          ? citedSources.map((src) => (
                              <span
                                key={src.id}
                                className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-amber-200"
                              >
                                {src.url ? (
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:text-amber-100"
                                  >
                                    {src.title}
                                  </a>
                                ) : (
                                  src.title
                                )}
                              </span>
                            ))
                          : citedIds.map((id) => (
                              <span
                                key={id}
                                className="rounded border border-theme-border bg-theme-panel px-1.5 py-0.5 text-theme-secondary"
                              >
                                {id}
                              </span>
                            ))}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Card>
      ) : null}

      {/* ─── Embedded Lesson Media ──────────────────────────────────────────── */}
      <Card title="Embedded Lesson Media (Public Domain / CC0)">
        {uniqueEmbeddedMediaCredits.length === 0 ? (
          <p className="text-sm text-theme-secondary">No external media is currently embedded in lessons.</p>
        ) : (
          <div className="space-y-3">
            {uniqueEmbeddedMediaCredits.map((item) => (
              <div
                key={item.sourceUrl}
                className="rounded border border-theme-border bg-theme-base p-3 text-xs text-theme-secondary"
              >
                <p className="font-semibold text-theme-text">{item.diagramTitle}</p>
                <p className="mt-1">Used in Stage {item.stageId} ({item.lessonTitle})</p>
                <p className="mt-1">
                  Source:{' '}
                  <a
                    className="text-amber-300 hover:text-amber-200"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.sourceName}
                  </a>
                </p>
                <p>
                  Creator: {item.creator ?? 'Not listed'} | Rights:{' '}
                  {item.licenseUrl ? (
                    <a
                      className="text-amber-300 hover:text-amber-200"
                      href={item.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.licenseName}
                    </a>
                  ) : (
                    item.licenseName
                  )}
                </p>
                <p>
                  Verification: {item.verifiedOn ?? 'Not recorded'}
                  {item.rightsStatus ? ` | Status: ${item.rightsStatus}` : ''}
                </p>
                {item.verificationNotes ? (
                  <p className="text-theme-secondary">{item.verificationNotes}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Authorship">
        <p className="text-sm text-theme-secondary">
          Core app code, lesson structure, and built-in schematic-style diagrams are developed by
          Rich Brotherton unless otherwise credited on this page.
        </p>
        <div className="mt-3">
          <Link to="/" className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text">
            Back to Dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
};
