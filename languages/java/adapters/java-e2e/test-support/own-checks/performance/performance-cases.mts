import { LOG_CASES } from './log-cases.mts';
import { BATCH_CASES } from './spring-data/batch-cases.mts';
import { SAVE_DECLINED_CASES } from './spring-data/save-declines.mts';
import { SAVE_FIXED_CASES } from './spring-data/save-cases.mts';

export const PERFORMANCE_SAFE_CASES = [...LOG_CASES];

export const PERFORMANCE_REVIEW_CASES = [
  ...SAVE_FIXED_CASES,
  ...SAVE_DECLINED_CASES,
  ...BATCH_CASES,
];
