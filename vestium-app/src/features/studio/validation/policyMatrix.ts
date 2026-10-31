export type ValidationDomain =
  | 'cybersecurity'
  | 'healthcare'
  | 'sales'
  | 'customer-service'
  | 'engineering'
  | 'regulatory-compliance'   // Vestium — UK H&S regulatory modules
  | 'general';

export interface DomainValidationPolicy {
  domain: ValidationDomain;
  requiredClaimProviders: Array<'crossref' | 'openalex' | 'semanticscholar' | 'nvd' | 'openfda' | 'factchecktools'>;
  sourceDiscoveryProviders: Array<'crossref' | 'openalex' | 'semanticscholar'>;
  imageProviders: Array<'unsplash' | 'pexels' | 'pixabay'>;
  maxSourceAgeYears: number | null; // null = no age limit (e.g. in-force legislation)
  minCriticalCitationDepth: number;
  maxClaimsToVerify: number;
}

const BASE_POLICY: DomainValidationPolicy = {
  domain: 'general',
  requiredClaimProviders: ['crossref', 'openalex'],
  sourceDiscoveryProviders: ['crossref', 'openalex', 'semanticscholar'],
  imageProviders: ['unsplash', 'pexels', 'pixabay'],
  maxSourceAgeYears: 7,
  minCriticalCitationDepth: 2,
  maxClaimsToVerify: 8
};

export function inferValidationDomain(domainPrompt: string, isRegulatoryModule?: boolean): ValidationDomain {
  // Compliance mode takes explicit precedence — regulatory modules are always 'regulatory-compliance'
  if (isRegulatoryModule) return 'regulatory-compliance';
  const text = domainPrompt.toLowerCase();
  if (/mhswr|coshh|puwer|loler|dsear|cdm 2015|health and safety at work|compliance.*training|regulatory.*h&s|h&s.*regulatory/.test(text)) return 'regulatory-compliance';
  if (/cyber|security|soc|malware|phishing|cve|incident/.test(text)) return 'cybersecurity';
  if (/medical|clinical|health|nurs|pharma|patient|hospital/.test(text)) return 'healthcare';
  if (/sales|prospect|objection|closing|account/.test(text)) return 'sales';
  if (/customer service|support|de-escalation|complaint|retention/.test(text)) return 'customer-service';
  if (/electrical|engineering|automation|controller|controls|industrial/.test(text)) return 'engineering';
  return 'general';
}

export function getPolicyForDomain(domainPrompt: string): DomainValidationPolicy {
  const domain = inferValidationDomain(domainPrompt);

  if (domain === 'cybersecurity') {
    return {
      ...BASE_POLICY,
      domain,
      requiredClaimProviders: ['nvd', 'crossref', 'openalex'],
      maxSourceAgeYears: 2,
      maxClaimsToVerify: 10
    };
  }

  if (domain === 'healthcare') {
    return {
      ...BASE_POLICY,
      domain,
      requiredClaimProviders: ['openfda', 'crossref', 'openalex'],
      maxSourceAgeYears: 3,
      maxClaimsToVerify: 10
    };
  }

  if (domain === 'sales' || domain === 'customer-service') {
    return {
      ...BASE_POLICY,
      domain,
      requiredClaimProviders: ['crossref', 'openalex', 'factchecktools'],
      maxSourceAgeYears: 8,
      maxClaimsToVerify: 6
    };
  }

  if (domain === 'engineering') {
    return {
      ...BASE_POLICY,
      domain,
      requiredClaimProviders: ['crossref', 'openalex', 'semanticscholar'],
      maxSourceAgeYears: 6,
      maxClaimsToVerify: 8
    };
  }

  if (domain === 'regulatory-compliance') {
    // Regulatory H&S compliance modules: legislation.gov.uk and hse.gov.uk are the
    // authoritative sources. Academic citation providers are not relevant here —
    // source verification is against official government publications.
    return {
      ...BASE_POLICY,
      domain,
      requiredClaimProviders: [],           // regulatory sources are checked via schema registry, not API providers
      sourceDiscoveryProviders: [],          // sources are pre-defined in the regulatory schema, not discovered
      maxSourceAgeYears: null,               // null = no age limit — legislation in force is always current
      minCriticalCitationDepth: 2,
      maxClaimsToVerify: 15                  // regulatory modules have more claims to verify
    };
  }

  return { ...BASE_POLICY, domain };
}
