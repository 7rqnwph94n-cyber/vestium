import type { ValidationDomain } from './policyMatrix';

export type EvidenceProviderId =
  | 'crossref'
  | 'openalex'
  | 'semanticscholar'
  | 'nvd'
  | 'openfda'
  | 'factchecktools'
  | 'unsplash'
  | 'pexels'
  | 'pixabay';

export interface SourceCandidate {
  provider: EvidenceProviderId;
  title: string;
  url: string;
  year?: number;
  publisher?: string;
  reliability: 'authoritative' | 'reputable' | 'secondary';
}

export interface ClaimEvidence {
  provider: EvidenceProviderId;
  title: string;
  url: string;
  confidence: number;
  publishedYear?: number;
  notes?: string;
}

export interface ImageCandidate {
  provider: EvidenceProviderId;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  creator?: string;
  licenseName?: string;
}

export interface EvidenceProvider {
  id: EvidenceProviderId;
  discoverSources?: (query: string, domain: ValidationDomain) => Promise<SourceCandidate[]>;
  verifyClaim?: (claim: string, domain: ValidationDomain) => Promise<ClaimEvidence[]>;
  findImages?: (query: string) => Promise<ImageCandidate[]>;
}

export interface EvidenceProviderConfigMeta {
  id: EvidenceProviderId;
  label: string;
  description: string;
  docsUrl: string;
  requiresKey: boolean;
}

const KEY_STORAGE_KEYS: Partial<Record<EvidenceProviderId, string>> = {
  openalex: 'studio-openalex-key',
  semanticscholar: 'studio-semanticscholar-key',
  nvd: 'studio-nvd-key',
  openfda: 'studio-openfda-key',
  factchecktools: 'studio-google-factcheck-key',
  unsplash: 'studio-unsplash-key',
  pexels: 'studio-pexels-key',
  pixabay: 'studio-pixabay-key'
};

const KEY_ENV_VARS: Partial<Record<EvidenceProviderId, string>> = {
  openalex: 'VITE_OPENALEX_API_KEY',
  semanticscholar: 'VITE_SEMANTICSCHOLAR_API_KEY',
  nvd: 'VITE_NVD_API_KEY',
  openfda: 'VITE_OPENFDA_API_KEY',
  factchecktools: 'VITE_GOOGLE_FACTCHECK_API_KEY',
  unsplash: 'VITE_UNSPLASH_API_KEY',
  pexels: 'VITE_PEXELS_API_KEY',
  pixabay: 'VITE_PIXABAY_API_KEY'
};

type ProviderKeySource = 'none' | 'local' | 'env';

function readLocalProviderKey(providerId: EvidenceProviderId): string {
  const storageKey = KEY_STORAGE_KEYS[providerId];
  if (!storageKey) return '';
  try {
    return localStorage.getItem(storageKey)?.trim() ?? '';
  } catch {
    return '';
  }
}

function readEnvProviderKey(providerId: EvidenceProviderId): string {
  const envVar = KEY_ENV_VARS[providerId];
  if (!envVar) return '';
  try {
    const env = import.meta.env as Record<string, string | undefined>;
    return env[envVar]?.trim() ?? '';
  } catch {
    return '';
  }
}

function getProviderKey(providerId: EvidenceProviderId): { key: string; source: ProviderKeySource } {
  const local = readLocalProviderKey(providerId);
  if (local) return { key: local, source: 'local' };
  const env = readEnvProviderKey(providerId);
  if (env) return { key: env, source: 'env' };
  return { key: '', source: 'none' };
}

function getStoredProviderKey(providerId: EvidenceProviderId): string {
  return getProviderKey(providerId).key;
}

function saveProviderKey(providerId: EvidenceProviderId, key: string): void {
  const storageKey = KEY_STORAGE_KEYS[providerId];
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, key.trim());
  } catch {
    // ignore
  }
}

function clearStoredProviderKey(providerId: EvidenceProviderId): void {
  const storageKey = KEY_STORAGE_KEYS[providerId];
  if (!storageKey) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

function pickSearchTerm(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .slice(0, 8)
    .join(' ')
    .trim() || text.slice(0, 80);
}

async function fetchJsonWithTimeout<T>(input: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

function filterDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

const crossrefProvider: EvidenceProvider = {
  id: 'crossref',
  async discoverSources(query) {
    const term = encodeURIComponent(pickSearchTerm(query));
    const url = `https://api.crossref.org/works?query.bibliographic=${term}&rows=5`;
    const payload = await fetchJsonWithTimeout<{
      message?: { items?: Array<{ title?: string[]; URL?: string; DOI?: string; published?: { 'date-parts'?: number[][] }; publisher?: string }> }
    }>(url);

    const items = payload.message?.items ?? [];
    return items
      .map((item) => {
        const title = item.title?.[0]?.trim();
        const doiUrl = item.DOI ? `https://doi.org/${item.DOI}` : undefined;
        const urlValue = item.URL ?? doiUrl;
        if (!title || !urlValue) return null;
        const year = item.published?.['date-parts']?.[0]?.[0];
        return {
          provider: 'crossref' as const,
          title,
          url: urlValue,
          year: Number.isFinite(year) ? year : undefined,
          publisher: item.publisher,
          reliability: 'authoritative' as const
        };
      })
      .filter(filterDefined);
  },
  async verifyClaim(claim, domain) {
    const sources = await this.discoverSources?.(claim, domain);
    return (sources ?? []).slice(0, 3).map((source) => ({
      provider: 'crossref' as const,
      title: source.title,
      url: source.url,
      confidence: source.reliability === 'authoritative' ? 0.8 : 0.6,
      publishedYear: source.year,
      notes: source.publisher
    }));
  }
};

const openAlexProvider: EvidenceProvider = {
  id: 'openalex',
  async discoverSources(query) {
    const term = encodeURIComponent(pickSearchTerm(query));
    const url = new URL('https://api.openalex.org/works');
    url.searchParams.set('search', term);
    url.searchParams.set('per-page', '5');
    const key = getStoredProviderKey('openalex');
    if (key) url.searchParams.set('api_key', key);

    const payload = await fetchJsonWithTimeout<{
      results?: Array<{ title?: string; primary_location?: { landing_page_url?: string; source?: { display_name?: string } }; publication_year?: number }>
    }>(url.toString());

    return (payload.results ?? [])
      .map((item) => {
        if (!item.title || !item.primary_location?.landing_page_url) return null;
        return {
          provider: 'openalex' as const,
          title: item.title,
          url: item.primary_location.landing_page_url,
          year: item.publication_year,
          publisher: item.primary_location.source?.display_name,
          reliability: 'authoritative' as const
        };
      })
      .filter(filterDefined);
  },
  async verifyClaim(claim, domain) {
    const sources = await this.discoverSources?.(claim, domain);
    return (sources ?? []).slice(0, 3).map((source) => ({
      provider: 'openalex' as const,
      title: source.title,
      url: source.url,
      confidence: 0.82,
      publishedYear: source.year,
      notes: source.publisher
    }));
  }
};

const semanticScholarProvider: EvidenceProvider = {
  id: 'semanticscholar',
  async discoverSources(query) {
    const term = encodeURIComponent(pickSearchTerm(query));
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${term}&limit=5&fields=title,url,year,venue`;
    const apiKey = getStoredProviderKey('semanticscholar');
    const payload = await fetchJsonWithTimeout<{
      data?: Array<{ title?: string; url?: string; year?: number; venue?: string }>
    }>(url, {
      headers: apiKey ? { 'x-api-key': apiKey } : undefined
    });

    return (payload.data ?? [])
      .map((item) => {
        if (!item.title || !item.url) return null;
        return {
          provider: 'semanticscholar' as const,
          title: item.title,
          url: item.url,
          year: item.year,
          publisher: item.venue,
          reliability: 'reputable' as const
        };
      })
      .filter(filterDefined);
  },
  async verifyClaim(claim, domain) {
    const sources = await this.discoverSources?.(claim, domain);
    return (sources ?? []).slice(0, 3).map((source) => ({
      provider: 'semanticscholar' as const,
      title: source.title,
      url: source.url,
      confidence: 0.75,
      publishedYear: source.year,
      notes: source.publisher
    }));
  }
};

const nvdProvider: EvidenceProvider = {
  id: 'nvd',
  async verifyClaim(claim) {
    const term = encodeURIComponent(pickSearchTerm(claim));
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${term}&resultsPerPage=3`;
    const apiKey = getStoredProviderKey('nvd');
    const payload = await fetchJsonWithTimeout<{
      vulnerabilities?: Array<{ cve?: { id?: string; published?: string; descriptions?: Array<{ lang?: string; value?: string }> } }>;
    }>(url, {
      headers: apiKey ? { apiKey } : undefined
    });

    return (payload.vulnerabilities ?? [])
      .map((entry) => {
        const cve = entry.cve;
        const id = cve?.id;
        if (!id) return null;
        const description = cve?.descriptions?.find((d) => d.lang === 'en')?.value ?? '';
        return {
          provider: 'nvd' as const,
          title: `${id}: ${description.slice(0, 120)}`,
          url: `https://nvd.nist.gov/vuln/detail/${id}`,
          confidence: description.length > 30 ? 0.88 : 0.72,
          publishedYear: cve?.published ? new Date(cve.published).getFullYear() : undefined,
          notes: 'Matched against NVD CVE records by keyword search.'
        };
      })
      .filter(filterDefined);
  }
};

const openfdaProvider: EvidenceProvider = {
  id: 'openfda',
  async verifyClaim(claim) {
    const term = pickSearchTerm(claim).split(' ')[0];
    if (!term) return [];
    const url = new URL('https://api.fda.gov/drug/label.json');
    url.searchParams.set('search', `openfda.generic_name:${term}`);
    url.searchParams.set('limit', '3');
    const apiKey = getStoredProviderKey('openfda');
    if (apiKey) url.searchParams.set('api_key', apiKey);

    const payload = await fetchJsonWithTimeout<{
      results?: Array<{ openfda?: { brand_name?: string[]; manufacturer_name?: string[] }; id?: string; effective_time?: string }>;
    }>(url.toString());

    return (payload.results ?? [])
      .map((item) => {
        const brand = item.openfda?.brand_name?.[0];
        if (!brand) return null;
        const manufacturer = item.openfda?.manufacturer_name?.[0] ?? 'FDA label database';
        return {
          provider: 'openfda' as const,
          title: `${brand} labeling data`,
          url: 'https://open.fda.gov/apis/drug/label/',
          confidence: 0.76,
          publishedYear: item.effective_time ? Number(item.effective_time.slice(0, 4)) : undefined,
          notes: `Manufacturer: ${manufacturer}`
        };
      })
      .filter(filterDefined);
  }
};

const factCheckToolsProvider: EvidenceProvider = {
  id: 'factchecktools',
  async verifyClaim(claim) {
    const key = getStoredProviderKey('factchecktools');
    if (!key) return [];
    const url = new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');
    url.searchParams.set('query', claim.slice(0, 220));
    url.searchParams.set('pageSize', '3');
    url.searchParams.set('key', key);

    const payload = await fetchJsonWithTimeout<{
      claims?: Array<{ text?: string; claimReview?: Array<{ textualRating?: string; publisher?: { name?: string }; url?: string }> }>;
    }>(url.toString());

    return (payload.claims ?? []).flatMap((entry) =>
      (entry.claimReview ?? []).map((review) => ({
        provider: 'factchecktools' as const,
        title: `${review.publisher?.name ?? 'Fact-check review'}: ${review.textualRating ?? 'rated'}`,
        url: review.url ?? 'https://developers.google.com/fact-check/tools/api',
        confidence: 0.82,
        notes: entry.text ?? ''
      }))
    );
  }
};

const unsplashProvider: EvidenceProvider = {
  id: 'unsplash',
  async findImages(query) {
    const key = getStoredProviderKey('unsplash');
    if (!key) return [];
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '6');

    const payload = await fetchJsonWithTimeout<{
      results?: Array<{ alt_description?: string; urls?: { regular?: string }; links?: { html?: string }; user?: { name?: string } }>;
    }>(url.toString(), {
      headers: { Authorization: `Client-ID ${key}` }
    });

    return (payload.results ?? [])
      .map((image) => {
        const imageUrl = image.urls?.regular;
        const sourceUrl = image.links?.html;
        if (!imageUrl || !sourceUrl) return null;
        return {
          provider: 'unsplash' as const,
          title: image.alt_description ?? 'Unsplash image',
          imageUrl,
          sourceUrl,
          creator: image.user?.name,
          licenseName: 'Unsplash License'
        };
      })
      .filter(filterDefined);
  }
};

const pexelsProvider: EvidenceProvider = {
  id: 'pexels',
  async findImages(query) {
    const key = getStoredProviderKey('pexels');
    if (!key) return [];
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '6');

    const payload = await fetchJsonWithTimeout<{
      photos?: Array<{ alt?: string; src?: { large?: string }; photographer?: string; url?: string }>;
    }>(url.toString(), {
      headers: { Authorization: key }
    });

    return (payload.photos ?? [])
      .map((image) => {
        const imageUrl = image.src?.large;
        const sourceUrl = image.url;
        if (!imageUrl || !sourceUrl) return null;
        return {
          provider: 'pexels' as const,
          title: image.alt ?? 'Pexels image',
          imageUrl,
          sourceUrl,
          creator: image.photographer,
          licenseName: 'Pexels License'
        };
      })
      .filter(filterDefined);
  }
};

const pixabayProvider: EvidenceProvider = {
  id: 'pixabay',
  async findImages(query) {
    const key = getStoredProviderKey('pixabay');
    if (!key) return [];
    const url = new URL('https://pixabay.com/api/');
    url.searchParams.set('key', key);
    url.searchParams.set('q', query);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('per_page', '6');

    const payload = await fetchJsonWithTimeout<{
      hits?: Array<{ tags?: string; webformatURL?: string; pageURL?: string; user?: string }>;
    }>(url.toString());

    return (payload.hits ?? [])
      .map((image) => {
        if (!image.webformatURL || !image.pageURL) return null;
        return {
          provider: 'pixabay' as const,
          title: image.tags ?? 'Pixabay image',
          imageUrl: image.webformatURL,
          sourceUrl: image.pageURL,
          creator: image.user,
          licenseName: 'Pixabay Content License'
        };
      })
      .filter(filterDefined);
  }
};

const PROVIDERS: Record<EvidenceProviderId, EvidenceProvider> = {
  crossref: crossrefProvider,
  openalex: openAlexProvider,
  semanticscholar: semanticScholarProvider,
  nvd: nvdProvider,
  openfda: openfdaProvider,
  factchecktools: factCheckToolsProvider,
  unsplash: unsplashProvider,
  pexels: pexelsProvider,
  pixabay: pixabayProvider
};

const PROVIDER_META: EvidenceProviderConfigMeta[] = [
  {
    id: 'openalex',
    label: 'OpenAlex',
    description: 'Research source discovery and publication metadata enrichment.',
    docsUrl: 'https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication',
    requiresKey: true
  },
  {
    id: 'semanticscholar',
    label: 'Semantic Scholar',
    description: 'Academic source discovery and relevance support.',
    docsUrl: 'https://www.semanticscholar.org/product/api',
    requiresKey: true
  },
  {
    id: 'nvd',
    label: 'NVD (NIST)',
    description: 'CVE and vulnerability claim verification for cybersecurity modules.',
    docsUrl: 'https://nvd.nist.gov/developers/start-here',
    requiresKey: true
  },
  {
    id: 'openfda',
    label: 'openFDA',
    description: 'Healthcare and drug-label verification for regulated domains.',
    docsUrl: 'https://open.fda.gov/apis/authentication/',
    requiresKey: true
  },
  {
    id: 'factchecktools',
    label: 'Google Fact Check Tools',
    description: 'Claim-review discovery for high-risk ambiguous claims.',
    docsUrl: 'https://developers.google.com/fact-check/tools/api',
    requiresKey: true
  },
  {
    id: 'unsplash',
    label: 'Unsplash',
    description: 'Contextual learning images with attribution metadata.',
    docsUrl: 'https://unsplash.com/documentation',
    requiresKey: true
  },
  {
    id: 'pexels',
    label: 'Pexels',
    description: 'Open media search for instructional visuals.',
    docsUrl: 'https://www.pexels.com/api/documentation/',
    requiresKey: true
  },
  {
    id: 'pixabay',
    label: 'Pixabay',
    description: 'Alternative visual source for module diagrams.',
    docsUrl: 'https://pixabay.com/api/docs/',
    requiresKey: true
  },
  {
    id: 'crossref',
    label: 'Crossref',
    description: 'DOI-based source discovery and citation metadata.',
    docsUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/',
    requiresKey: false
  }
];

export function getEvidenceProvider(providerId: EvidenceProviderId): EvidenceProvider {
  return PROVIDERS[providerId];
}

export function listEvidenceProviders(): EvidenceProvider[] {
  return Object.values(PROVIDERS);
}

export function readProviderKey(providerId: EvidenceProviderId): string {
  return getStoredProviderKey(providerId);
}

export function readProviderKeyDetails(
  providerId: EvidenceProviderId
): { key: string; source: ProviderKeySource } {
  return getProviderKey(providerId);
}

export function writeProviderKey(providerId: EvidenceProviderId, key: string): void {
  saveProviderKey(providerId, key);
}

export function clearProviderKey(providerId: EvidenceProviderId): void {
  clearStoredProviderKey(providerId);
}

export function listProviderConfigMeta(): EvidenceProviderConfigMeta[] {
  return PROVIDER_META;
}

export async function testProviderKey(
  providerId: EvidenceProviderId,
  key: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = key.trim();
  try {
    if (providerId === 'crossref') {
      return { ok: true };
    }

    if (providerId === 'openalex') {
      const url = new URL('https://api.openalex.org/works');
      url.searchParams.set('search', 'training');
      url.searchParams.set('per-page', '1');
      url.searchParams.set('api_key', trimmed);
      await fetchJsonWithTimeout(url.toString());
      return { ok: true };
    }

    if (providerId === 'semanticscholar') {
      const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=training&limit=1&fields=title';
      await fetchJsonWithTimeout(url, { headers: { 'x-api-key': trimmed } });
      return { ok: true };
    }

    if (providerId === 'nvd') {
      const url = 'https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1';
      await fetchJsonWithTimeout(url, { headers: { apiKey: trimmed } });
      return { ok: true };
    }

    if (providerId === 'openfda') {
      const url = new URL('https://api.fda.gov/drug/label.json');
      url.searchParams.set('search', 'openfda.brand_name:aspirin');
      url.searchParams.set('limit', '1');
      url.searchParams.set('api_key', trimmed);
      await fetchJsonWithTimeout(url.toString());
      return { ok: true };
    }

    if (providerId === 'factchecktools') {
      const url = new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');
      url.searchParams.set('query', 'training claim');
      url.searchParams.set('pageSize', '1');
      url.searchParams.set('key', trimmed);
      await fetchJsonWithTimeout(url.toString());
      return { ok: true };
    }

    if (providerId === 'unsplash') {
      const url = 'https://api.unsplash.com/search/photos?query=training&per_page=1';
      await fetchJsonWithTimeout(url, { headers: { Authorization: `Client-ID ${trimmed}` } });
      return { ok: true };
    }

    if (providerId === 'pexels') {
      const url = 'https://api.pexels.com/v1/search?query=training&per_page=1';
      await fetchJsonWithTimeout(url, { headers: { Authorization: trimmed } });
      return { ok: true };
    }

    if (providerId === 'pixabay') {
      const url = new URL('https://pixabay.com/api/');
      url.searchParams.set('key', trimmed);
      url.searchParams.set('q', 'training');
      url.searchParams.set('per_page', '3');
      await fetchJsonWithTimeout(url.toString());
      return { ok: true };
    }

    return { ok: false, error: 'Unknown provider' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
