import type { StageLessonsOutput } from './types';
import { getEvidenceProvider } from '../validation/evidenceProviders';

export interface ImageResolverContext {
  domainPrompt: string;
  sourceReferences: string[];
}

interface WikimediaPage {
  title: string;
  imageinfo?: Array<{
    url?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

interface OpenverseImageResult {
  title?: string;
  url?: string;
  creator?: string;
  license?: string;
  license_url?: string;
  foreign_landing_url?: string;
  source?: string;
}

interface ResolvedImageCandidate {
  provider: string;
  imageUrl: string;
  sourceName: string;
  sourceUrl: string;
  creator?: string;
  licenseName: string;
  licenseUrl?: string;
  matchedTerms: string[];
  relevanceScore: number;
  candidateText: string;
}

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const OPENVERSE_API = 'https://api.openverse.org/v1/images/';
const MAX_SEARCH_RESULTS = 8;
const MAX_LOOKUPS_PER_STAGE = 12;
const MIN_CONTEXT_MATCH_TERMS = 2;
const MIN_RELEVANCE_SCORE = 0.42;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'at', 'by',
  'from', 'as', 'is', 'are', 'this', 'that', 'these', 'those', 'lesson', 'diagram',
  'training', 'module', 'system', 'process', 'basic', 'introduction'
]);

function stripHtml(value?: string): string {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function mapRightsStatus(licenseNameRaw: string): 'public-domain' | 'cc0' | 'other' {
  const license = licenseNameRaw.toLowerCase();
  if (license.includes('public domain') || license.includes('pdm')) return 'public-domain';
  if (license.includes('cc0') || license.includes('cc-0')) return 'cc0';
  return 'other';
}

function isAllowedOpenLicense(licenseNameRaw: string): boolean {
  const license = licenseNameRaw.toLowerCase();
  return (
    license.includes('public domain') ||
    license.includes('pdm') ||
    license.includes('cc0') ||
    license.includes('cc-0')
  );
}

function tokenizeContext(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function buildContextTerms(domainPrompt: string, lessonTitle: string, diagramTitle: string): string[] {
  const all = [...tokenizeContext(domainPrompt), ...tokenizeContext(lessonTitle), ...tokenizeContext(diagramTitle)];
  return Array.from(new Set(all));
}

function findMatchedTerms(contextTerms: string[], candidateText: string): string[] {
  const text = ` ${candidateText.toLowerCase()} `;
  return contextTerms.filter((term) => text.includes(` ${term} `));
}

function computeRelevanceScore(contextTerms: string[], matchedTerms: string[]): number {
  if (contextTerms.length === 0) return 0;
  const ratio = matchedTerms.length / contextTerms.length;
  const enoughMatchesBonus = matchedTerms.length >= 3 ? 0.12 : 0;
  return Math.max(0, Math.min(1, ratio + enoughMatchesBonus));
}

function isCandidateVerified(candidate: ResolvedImageCandidate): boolean {
  const hasRequiredFields =
    /^https?:\/\//.test(candidate.imageUrl) &&
    /^https?:\/\//.test(candidate.sourceUrl) &&
    Boolean(candidate.licenseName?.trim());
  if (!hasRequiredFields) return false;
  if (candidate.matchedTerms.length < MIN_CONTEXT_MATCH_TERMS) return false;
  if (candidate.relevanceScore < MIN_RELEVANCE_SCORE) return false;
  return true;
}

function makeSearchQueries(domainPrompt: string, lessonTitle: string, diagramTitle: string): string[] {
  const terms = [diagramTitle, lessonTitle, domainPrompt].map((t) => t.trim()).filter(Boolean);
  const combined = terms.join(' ');
  return [
    combined,
    `${lessonTitle} ${diagramTitle}`.trim(),
    `${domainPrompt} ${diagramTitle}`.trim(),
    lessonTitle
  ].filter(Boolean);
}

function sourceHintsFromReferences(refs: string[]): string[] {
  return refs
    .map((ref) => {
      try {
        const url = new URL(ref);
        if (url.hostname.includes('wikimedia.org') || url.hostname.includes('wikipedia.org')) {
          return decodeURIComponent(url.pathname.split('/').pop() ?? '').replace(/_/g, ' ');
        }
      } catch {
        // ignore non-URL references
      }
      return '';
    })
    .filter(Boolean);
}

async function searchCommonsImage(query: string): Promise<WikimediaPage[]> {
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', `${query} filetype:bitmap`);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', String(MAX_SEARCH_RESULTS));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Wikimedia search failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    query?: { pages?: Record<string, WikimediaPage> };
  };
  return Object.values(payload.query?.pages ?? {});
}

async function searchOpenverseImages(query: string): Promise<OpenverseImageResult[]> {
  const url = new URL(OPENVERSE_API);
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', String(MAX_SEARCH_RESULTS));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Openverse search failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    results?: OpenverseImageResult[];
  };
  return payload.results ?? [];
}

function pickAllowedCommonsCandidate(
  pages: WikimediaPage[],
  contextTerms: string[]
): ResolvedImageCandidate | null {
  let best: ResolvedImageCandidate | null = null;

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const meta = info.extmetadata ?? {};
    const licenseName = stripHtml(meta.LicenseShortName?.value || meta.License?.value);
    if (!licenseName || !isAllowedOpenLicense(licenseName)) continue;
    const titleText = page.title.replace(/^File:/, '').replace(/[_-]/g, ' ');
    const description = stripHtml(meta.ImageDescription?.value || meta.ObjectName?.value);
    const categories = stripHtml(meta.Categories?.value);
    const matchedTerms = findMatchedTerms(
      contextTerms,
      `${titleText} ${description} ${categories}`
    );
    const relevanceScore = computeRelevanceScore(contextTerms, matchedTerms);

    const sourceUrl = info.descriptionurl
      ? info.descriptionurl
      : `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
    const creator = stripHtml(meta.Artist?.value) || undefined;
    const licenseUrl = stripHtml(meta.LicenseUrl?.value) || undefined;
    const sourceName = stripHtml(meta.ObjectName?.value) || page.title.replace(/^File:/, '');

    const candidate: ResolvedImageCandidate = {
      provider: 'Wikimedia Commons',
      imageUrl: info.url,
      sourceName,
      sourceUrl,
      creator,
      licenseName,
      licenseUrl,
      matchedTerms,
      relevanceScore,
      candidateText: `${titleText} ${description}`.trim()
    };
    if (!isCandidateVerified(candidate)) continue;
    if (!best || candidate.relevanceScore > best.relevanceScore) best = candidate;
  }
  return best;
}

function pickAllowedOpenverseCandidate(
  results: OpenverseImageResult[],
  contextTerms: string[]
): ResolvedImageCandidate | null {
  let best: ResolvedImageCandidate | null = null;

  for (const result of results) {
    if (!result.url) continue;
    const licenseName = (result.license ?? '').trim();
    if (!licenseName || !isAllowedOpenLicense(licenseName)) continue;
    const sourceUrl = result.foreign_landing_url?.trim();
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) continue;
    const matchedTerms = findMatchedTerms(
      contextTerms,
      `${result.title ?? ''} ${result.creator ?? ''} ${result.source ?? ''}`
    );
    const relevanceScore = computeRelevanceScore(contextTerms, matchedTerms);

    const candidate: ResolvedImageCandidate = {
      provider: 'Openverse',
      imageUrl: result.url,
      sourceName: (result.title ?? '').trim() || 'Openverse image',
      sourceUrl,
      creator: (result.creator ?? '').trim() || undefined,
      licenseName,
      licenseUrl: (result.license_url ?? '').trim() || undefined,
      matchedTerms,
      relevanceScore,
      candidateText: `${result.title ?? ''} ${result.creator ?? ''}`.trim()
    };
    if (!isCandidateVerified(candidate)) continue;
    if (!best || candidate.relevanceScore > best.relevanceScore) best = candidate;
  }
  return best;
}

function providerLicenseToRightsStatus(licenseName: string): 'public-domain' | 'cc0' | 'other' {
  return mapRightsStatus(licenseName);
}

async function pickProviderCandidate(
  providerId: 'unsplash' | 'pexels' | 'pixabay',
  query: string,
  contextTerms: string[]
): Promise<ResolvedImageCandidate | null> {
  const provider = getEvidenceProvider(providerId);
  if (!provider.findImages) return null;
  const results = await provider.findImages(query);
  let best: ResolvedImageCandidate | null = null;

  for (const result of results) {
    const candidateText = `${result.title} ${result.creator ?? ''}`;
    const matchedTerms = findMatchedTerms(contextTerms, candidateText);
    const relevanceScore = computeRelevanceScore(contextTerms, matchedTerms);
    const candidate: ResolvedImageCandidate = {
      provider: providerId,
      imageUrl: result.imageUrl,
      sourceName: result.title,
      sourceUrl: result.sourceUrl,
      creator: result.creator,
      licenseName: result.licenseName ?? `${providerId} license`,
      matchedTerms,
      relevanceScore,
      candidateText
    };
    if (!isCandidateVerified(candidate)) continue;
    if (!best || candidate.relevanceScore > best.relevanceScore) best = candidate;
  }

  return best;
}

function chooseHigherRelevance(
  current: ResolvedImageCandidate | null,
  next: ResolvedImageCandidate | null
): ResolvedImageCandidate | null {
  if (!next) return current;
  if (!current) return next;
  return next.relevanceScore > current.relevanceScore ? next : current;
}

function providerDisplayName(provider: string): string {
  if (provider === 'unsplash') return 'Unsplash';
  if (provider === 'pexels') return 'Pexels';
  if (provider === 'pixabay') return 'Pixabay';
  return provider;
}

export async function resolveLessonImages(
  stageOutput: StageLessonsOutput,
  context: ImageResolverContext
): Promise<StageLessonsOutput> {
  let lookups = 0;
  const sourceHints = sourceHintsFromReferences(context.sourceReferences);

  const stage = {
    ...stageOutput.stage,
    lessons: stageOutput.stage.lessons.map((lesson) => ({
      ...lesson,
      diagrams: lesson.diagrams.map((diagram) => ({ ...diagram }))
    }))
  };

  for (const lesson of stage.lessons) {
    for (const diagram of lesson.diagrams) {
      if (diagram.kind !== 'image') continue;

      const hasResolvedImage = Boolean(diagram.imageUrl && diagram.attribution?.sourceUrl && diagram.attribution?.licenseName);
      if (hasResolvedImage) continue;
      if (lookups >= MAX_LOOKUPS_PER_STAGE) continue;

      const queries = [
        ...makeSearchQueries(context.domainPrompt, lesson.title, diagram.title),
        ...sourceHints.slice(0, 2).map((hint) => `${hint} ${diagram.title}`.trim())
      ];
      const contextTerms = buildContextTerms(context.domainPrompt, lesson.title, diagram.title);
      let chosen: ResolvedImageCandidate | null = null;

      // Primary provider: Wikimedia Commons
      for (const query of queries) {
        if (!query) continue;
        try {
          lookups += 1;
          const pages = await searchCommonsImage(query);
          chosen = chooseHigherRelevance(chosen, pickAllowedCommonsCandidate(pages, contextTerms));
          if (chosen && chosen.relevanceScore >= 0.6) break;
        } catch {
          // Continue to next query/fallback path. Resolver must never block generation.
        }
        if (lookups >= MAX_LOOKUPS_PER_STAGE) break;
      }

      // Fallback provider: Openverse
      if (!chosen && lookups < MAX_LOOKUPS_PER_STAGE) {
        for (const query of queries.slice(0, 3)) {
          if (!query) continue;
          try {
            lookups += 1;
            const results = await searchOpenverseImages(query);
            chosen = chooseHigherRelevance(chosen, pickAllowedOpenverseCandidate(results, contextTerms));
            if (chosen && chosen.relevanceScore >= 0.6) break;
          } catch {
            // Continue to next query/fallback path. Resolver must never block generation.
          }
          if (lookups >= MAX_LOOKUPS_PER_STAGE) break;
        }
      }

      // Additional providers when available keys exist: Unsplash, Pexels, Pixabay.
      if (!chosen && lookups < MAX_LOOKUPS_PER_STAGE) {
        const providerOrder: Array<'unsplash' | 'pexels' | 'pixabay'> = ['unsplash', 'pexels', 'pixabay'];
        for (const providerId of providerOrder) {
          for (const query of queries.slice(0, 2)) {
            if (!query) continue;
            try {
              lookups += 1;
              const candidate = await pickProviderCandidate(providerId, query, contextTerms);
              chosen = chooseHigherRelevance(chosen, candidate);
              if (chosen && chosen.relevanceScore >= 0.6) break;
            } catch {
              // Keep resolver non-blocking.
            }
            if (lookups >= MAX_LOOKUPS_PER_STAGE) break;
          }
          if (lookups >= MAX_LOOKUPS_PER_STAGE || (chosen && chosen.relevanceScore >= 0.6)) break;
        }
      }

      if (!chosen) continue;

      const today = new Date().toISOString().slice(0, 10);
      diagram.imageUrl = chosen.imageUrl;
      diagram.alt = diagram.alt || `${lesson.title}: ${diagram.title}`;
      diagram.caption = diagram.caption || `Reference image for ${diagram.title}.`;
      diagram.attribution = {
        sourceName: chosen.sourceName,
        sourceUrl: chosen.sourceUrl,
        creator: chosen.creator,
        licenseName: chosen.licenseName,
        licenseUrl: chosen.licenseUrl,
        rightsStatus: providerLicenseToRightsStatus(chosen.licenseName),
        verifiedOn: today,
        verificationNotes: `Auto-resolved from ${providerDisplayName(chosen.provider)}. Relevance score: ${chosen.relevanceScore.toFixed(2)}. Matched terms: ${chosen.matchedTerms.slice(0, 8).join(', ')}. Candidate context: ${chosen.candidateText.slice(0, 140)}.`
      };
    }
  }

  return { stage };
}
