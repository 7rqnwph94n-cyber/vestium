// ─── Schema barrel for lazy loading ──────────────────────────────────────────
// Single dynamic import point so all 17 regulatory schemas load as one chunk
// when the workplace classifier is first invoked.

import { MHSWR_1999 } from './mhswr';
import { COSHH_2002 } from './coshh';
import { PUWER_1998 } from './puwer';
import { LOLER_1998 } from './loler';
import { MANUAL_HANDLING_1992 } from './manualHandling';
import { DSEAR_2002 } from './dsear';
import { CDM_2015 } from './cdm';
import { PPE_1992 } from './ppe';
import { WORK_AT_HEIGHT_2005 } from './workAtHeight';
import { WORKPLACE_1992 } from './workplace';
import { DSE_1992 } from './dse';
import { ELECTRICITY_AT_WORK_1989 } from './electricityAtWork';
import { CONFINED_SPACES_1997 } from './confinedSpaces';
import { ASBESTOS_2012 } from './asbestos';
import { NOISE_2005 } from './noise';
import { VIBRATION_2005 } from './vibration';
import { WAREHOUSING_STORAGE } from './warehousing';
import type { RegulatorySchema } from '../types';

export const ALL_SCHEMAS: Record<string, RegulatorySchema> = {
  'mhswr-1999': MHSWR_1999,
  'coshh-2002': COSHH_2002,
  'puwer-1998': PUWER_1998,
  'loler-1998': LOLER_1998,
  'manual-handling-1992': MANUAL_HANDLING_1992,
  'dsear-2002': DSEAR_2002,
  'cdm-2015': CDM_2015,
  'ppe-1992': PPE_1992,
  'work-at-height-2005': WORK_AT_HEIGHT_2005,
  'workplace-1992': WORKPLACE_1992,
  'dse-1992': DSE_1992,
  'electricity-at-work-1989': ELECTRICITY_AT_WORK_1989,
  'confined-spaces-1997': CONFINED_SPACES_1997,
  'asbestos-2012': ASBESTOS_2012,
  'noise-2005': NOISE_2005,
  'vibration-2005': VIBRATION_2005,
  'warehousing-storage': WAREHOUSING_STORAGE,
};
