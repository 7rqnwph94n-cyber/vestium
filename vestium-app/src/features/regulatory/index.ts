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
} from './types';

export { MHSWR_1999 } from './schemas/mhswr';

export {
  classifyWorkplace,
  detectIndustryType,
  INDUSTRY_TYPES,
} from './workplaceClassifier';

export type { IndustryType } from './workplaceClassifier';

export {
  buildRegulatoryContextBlock,
  buildRegulatoryContextCompact,
  buildFactCheckSeverityConfig,
} from './promptInjector';
