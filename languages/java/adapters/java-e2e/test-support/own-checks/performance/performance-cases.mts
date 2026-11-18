import { EXISTENCE_CASES } from './existence/existence-cases.mts';
import { LINEAR_LOOKUP_CASES } from './hoisting/linear-lookup-cases.mts';
import { LOG_CASES } from './log-cases.mts';
import { SET_CASES } from './sets/sets-cases.mts';
import { BATCH_CASES } from './spring-data/batch-cases.mts';
import { SAVE_FIXED_CASES } from './spring-data/save-cases.mts';
import { SAVE_DECLINED_CASES } from './spring-data/save-declines.mts';

export const PERFORMANCE_SAFE_CASES = [...LOG_CASES];

export const PERFORMANCE_REVIEW_CASES = [
  ...SAVE_FIXED_CASES,
  ...SAVE_DECLINED_CASES,
  ...BATCH_CASES,
  ...EXISTENCE_CASES,
  ...SET_CASES,
  ...LINEAR_LOOKUP_CASES,
];
