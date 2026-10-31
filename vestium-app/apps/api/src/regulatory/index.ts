export type {
  RegulatorySchema,
  RegulatorySourceDocument,
  RegulatoryDuty,
  RegulatoryValidationRule,
  FactCheckSeverityConfig,
  WorkplaceContext,
  ClassifiedSchema,
  WorkplaceClassificationResult,
  Jurisdiction,
  DocType,
  DocumentLicence,
  RegulatoryFindingSeverity,
} from './types.js';

export { MHSWR_1999 } from './schemas/mhswr.js';

export {
  classifyWorkplace,
  detectIndustryType,
  INDUSTRY_TYPES,
} from './workplaceClassifier.js';

export type { IndustryType } from './workplaceClassifier.js';

export {
  buildRegulatoryContextBlock,
  buildRegulatoryContextCompact,
  buildFactCheckSeverityConfig,
} from './promptInjector.js';
