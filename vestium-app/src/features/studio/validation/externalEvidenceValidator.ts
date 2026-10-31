import type { AssembledModule, ValidationError } from '../generator/types';
import { getPolicyForDomain } from './policyMatrix';
import { getEvidenceProvider, type ClaimEvidence, type SourceCandidate } from './evidenceProviders';

interface ExternalEvidenceValidationInput {
  moduleId: string;
  domainPrompt: string;
  objectives: string[];
  assembled: AssembledModule;
}

interface ClaimCheckTarget {
  claim: string;
  path: string;
  severityHint: 'high' | 'medium' | 'low';
}

const TRUSTED_HOST_HINTS = [
  'nist.gov',
  'cisa.gov',
  'nvd.nist.gov',
  'fda.gov',
  'who.int',
  'osha.gov',
  'ieee.org',
  'iec.ch',
  'iso.org',
  'nature.com',
  'science.org',
  'nejm.org',
  'thelancet.com'
];

function toUniqueUrls<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    result.push(item);
  }
  return result;
}

function selectClaims(input: ExternalEvidenceValidationInput, maxClaims: number): ClaimCheckTarget[] {
  const targets: ClaimCheckTarget[] = [];

  (input.assembled.factCheck?.items ?? [])
    .slice(0, maxClaims)
    .forEach((item, index) => {
      targets.push({
        claim: item.claim,
        path: `factCheck.items[${index}]`,
        severityHint: item.severity === 'regulatory' ? 'high' : item.severity
      });
    });

  if (targets.length === 0) {
    input.assembled.curriculum
      .flatMap((stage, stageIndex) => stage.lessons.map((lesson, lessonIndex) => ({
        claim: lesson.objective,
        path: `stages[${stageIndex + 1}].lessons[${lessonIndex}].objective`
      })))
      .slice(0, maxClaims)
      .forEach((entry) => {
        targets.push({ ...entry, severityHint: 'medium' });
      });
  }

  return targets.slice(0, maxClaims);
}

function hasSufficientEvidence(evidence: ClaimEvidence[], severityHint: 'high' | 'medium' | 'low'): boolean {
  const min = severityHint === 'high' ? 2 : 1;
  return evidence.length >= min;
}

function getCurrentYear(): number {
  return new Date().getFullYear();
}

function parseHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isHighReputationUrl(url: string): boolean {
  const host = parseHostname(url);
  if (!host) return false;
  if (host.endsWith('.gov') || host.endsWith('.gov.uk') || host.endsWith('.edu')) return true;
  return TRUSTED_HOST_HINTS.some((hint) => host === hint || host.endsWith(`.${hint}`));
}

function countHighReputationSourcesByFactCheckItem(
  sourceCatalog: AssembledModule['sourceCatalog'],
  factCheckItems: NonNullable<AssembledModule['factCheck']>['items']
): Map<string, number> {
  const catalogById = new Map(sourceCatalog.map((entry) => [entry.id, entry]));
  const result = new Map<string, number>();

  factCheckItems.forEach((item) => {
    const highRepCount = item.sourceIds.reduce((count, sourceId) => {
      const source = catalogById.get(sourceId);
      if (!source) return count;
      return count + (isHighReputationUrl(source.url) ? 1 : 0);
    }, 0);
    result.set(item.id, highRepCount);
  });

  return result;
}

export async function runExternalEvidenceValidation(
  input: ExternalEvidenceValidationInput
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const policy = getPolicyForDomain(input.domainPrompt);

  const nowYear = getCurrentYear();
  input.assembled.sourceCatalog.forEach((source, index) => {
    if (!source.year) return;
    const age = nowYear - source.year;
    if (policy.maxSourceAgeYears !== null && age > policy.maxSourceAgeYears) {
      errors.push({
        severity: 'warning',
        path: `sourceCatalog[${index}].year`,
        rule: 'EXTERNAL_SOURCE_FRESHNESS_LOW',
        message: `Source "${source.id}" is ${age} year(s) old; policy target is <= ${policy.maxSourceAgeYears} years for ${policy.domain}`
      });
    }
  });

  const objectiveCorpus = input.objectives.join(' ');
  const sourceQuery = `${input.domainPrompt} ${objectiveCorpus}`.trim();
  const discoveredSources: SourceCandidate[] = [];
  let discoveryProvidersAttempted = 0;
  let discoveryProvidersSucceeded = 0;

  for (const providerId of policy.sourceDiscoveryProviders) {
    const provider = getEvidenceProvider(providerId);
    if (!provider.discoverSources) continue;
    discoveryProvidersAttempted += 1;
    try {
      const found = await provider.discoverSources(sourceQuery, policy.domain);
      discoveredSources.push(...found);
      discoveryProvidersSucceeded += 1;
    } catch {
      errors.push({
        severity: 'warning',
        path: 'sourceCatalog',
        rule: 'EXTERNAL_PROVIDER_SOURCE_DISCOVERY_FAILED',
        message: `Source discovery provider "${providerId}" was unavailable for this run`
      });
    }
  }

  const uniqueDiscovered = toUniqueUrls(discoveredSources);
  if (uniqueDiscovered.length === 0) {
    errors.push({
      severity: 'warning',
      path: 'sourceCatalog',
      rule: 'EXTERNAL_DISCOVERY_EMPTY',
      message: 'External discovery returned no additional sources; verify references manually for coverage depth'
    });
  }

  const existingUrls = new Set(input.assembled.sourceCatalog.map((s) => s.url));
  const missingAuthoritative = uniqueDiscovered.filter(
    (item) => item.reliability === 'authoritative' && !existingUrls.has(item.url)
  );
  if (missingAuthoritative.length > 0) {
    errors.push({
      severity: 'warning',
      path: 'sourceCatalog',
      rule: 'EXTERNAL_AUTHORITATIVE_SOURCES_NOT_INCLUDED',
      message: `${missingAuthoritative.length} authoritative source(s) discovered externally are not in sourceCatalog`
    });
  }

  const highRepInCatalog = input.assembled.sourceCatalog.filter((source) => isHighReputationUrl(source.url)).length;
  const highRepDiscovered = uniqueDiscovered.filter((source) => isHighReputationUrl(source.url)).length;
  const hasHighReputationCoverage = highRepInCatalog + highRepDiscovered > 0;
  const discoveryAttempted = discoveryProvidersAttempted > 0;
  const discoveryUnavailable = discoveryAttempted && discoveryProvidersSucceeded === 0;
  const discoveryHighReputationGap = discoveryAttempted && highRepDiscovered === 0;
  const shouldDowngradeFactCheckConfidence =
    discoveryUnavailable || discoveryHighReputationGap || !hasHighReputationCoverage;

  if (discoveryUnavailable) {
    errors.push({
      severity: 'warning',
      path: 'sourceCatalog',
      rule: 'EXTERNAL_DISCOVERY_UNAVAILABLE',
      message:
        'All discovery providers failed in this run. External reliability governance is enforced and fact-check confidence is downgraded.'
    });
  }

  if (discoveryHighReputationGap) {
    errors.push({
      severity: 'warning',
      path: 'sourceCatalog',
      rule: 'EXTERNAL_DISCOVERY_HIGH_REPUTATION_GAP',
      message:
        'Discovery providers returned no .gov/.edu/trusted-reference domains in this run. Fact-check confidence is downgraded to secondary until high-reputation sources are present.'
    });
  }

  if (!hasHighReputationCoverage) {
    errors.push({
      severity: 'warning',
      path: 'sourceCatalog',
      rule: 'EXTERNAL_HIGH_REPUTATION_SOURCE_GAP',
      message:
        discoveryUnavailable
          ? 'No high-reputation sources available: all discovery providers failed in this run. Treat source reliability as secondary.'
          : 'No .gov/.edu/trusted-reference domains were found in source evidence. Treat source reliability as secondary.'
    });
  }

  if (shouldDowngradeFactCheckConfidence) {
    const factCheckItems = input.assembled.factCheck?.items ?? [];
    const highRepCountByItem = countHighReputationSourcesByFactCheckItem(input.assembled.sourceCatalog, factCheckItems);

    factCheckItems.forEach((item, index) => {
      if (item.verdict !== 'supported') return;
      const itemHighRepCount = highRepCountByItem.get(item.id) ?? 0;
      const minDepth = item.severity === 'high' ? policy.minCriticalCitationDepth : 1;
      const severity: ValidationError['severity'] =
        item.severity === 'high' || itemHighRepCount < minDepth ? 'error' : 'warning';

      errors.push({
        severity,
        path: `factCheck.items[${index}].verdict`,
        rule: 'FACT_CHECK_CONFIDENCE_DOWNGRADED',
        message:
          item.severity === 'high' || itemHighRepCount < minDepth
            ? `Supported claim "${item.id}" is downgraded: high-reputation evidence depth is ${itemHighRepCount}, requires >= ${minDepth} before high-confidence support.`
            : `Supported claim "${item.id}" confidence downgraded due to discovery governance failure or missing high-reputation external sources.`
      });
    });
  }

  const claimTargets = selectClaims(input, policy.maxClaimsToVerify);

  // If no claim-check providers are configured for this domain, emit one summary warning
  // rather than one per claim (avoids N × "not configured" noise for regulatory modules).
  if (policy.requiredClaimProviders.length === 0) {
    if (claimTargets.length > 0) {
      errors.push({
        severity: 'warning',
        path: 'factCheck',
        rule: 'EXTERNAL_CLAIM_CHECK_NOT_CONFIGURED',
        message: `No external claim-check providers are configured for ${policy.domain}; ${claimTargets.length} claim(s) were not independently verified`
      });
    }
    return errors;
  }

  for (const target of claimTargets) {
    const evidence: ClaimEvidence[] = [];
    let providerChecksSucceeded = 0;
    let providerChecksAttempted = 0;

    for (const providerId of policy.requiredClaimProviders) {
      const provider = getEvidenceProvider(providerId);
      if (!provider.verifyClaim) continue;
      providerChecksAttempted += 1;
      try {
        const claimEvidence = await provider.verifyClaim(target.claim, policy.domain);
        evidence.push(...claimEvidence);
        providerChecksSucceeded += 1;
      } catch {
        errors.push({
          severity: 'warning',
          path: target.path,
          rule: 'EXTERNAL_PROVIDER_CLAIM_CHECK_FAILED',
          message: `Claim-check provider "${providerId}" was unavailable while validating this claim`
        });
      }
    }

    const uniqueEvidence = toUniqueUrls(evidence);
    if (providerChecksAttempted === 0) {
      errors.push({
        severity: 'warning',
        path: target.path,
        rule: 'EXTERNAL_CLAIM_CHECK_NOT_CONFIGURED',
        message: 'No configured external claim-check providers were available for this domain policy'
      });
      continue;
    }
    if (providerChecksSucceeded === 0) {
      errors.push({
        severity: 'warning',
        path: target.path,
        rule: 'EXTERNAL_CLAIM_CHECK_UNAVAILABLE',
        message: 'All external claim-check providers were unavailable for this claim in this run'
      });
      continue;
    }
    if (!hasSufficientEvidence(uniqueEvidence, target.severityHint)) {
      errors.push({
        severity: 'warning',
        path: target.path,
        rule: 'EXTERNAL_CLAIM_EVIDENCE_WEAK',
        message: `External evidence depth was ${uniqueEvidence.length}; expected ${target.severityHint === 'high' ? '>= 2' : '>= 1'} supporting hits for this claim`
      });
    }
  }

  return errors;
}
