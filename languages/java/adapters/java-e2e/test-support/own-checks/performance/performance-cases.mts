import { EXISTENCE_CASES } from './existence/existence-cases.mts';
import { LINEAR_LOOKUP_CASES } from './hoisting/linear-lookup-cases.mts';
import { PREPARE_STATEMENT_CASES } from './hoisting/prepare-statement-cases.mts';
import { REUSABLE_OBJECT_CASES } from './hoisting/reusable-object-cases.mts';
import { LOG_CASES } from './log-cases.mts';
import { SET_CASES } from './sets/sets-cases.mts';
import { RANDOM_CASES } from './simple/random-cases.mts';
import { BATCH_CASES } from './spring-data/batch-cases.mts';
import { SAVE_FIXED_CASES } from './spring-data/save-cases.mts';
import { SAVE_DECLINED_CASES } from './spring-data/save-declines.mts';

export const PERFORMANCE_SAFE_CASES = [...LOG_CASES, ...RANDOM_CASES];

export const PERFORMANCE_REVIEW_CASES = [
  ...SAVE_FIXED_CASES,
  ...SAVE_DECLINED_CASES,
  ...BATCH_CASES,
  ...EXISTENCE_CASES,
  ...SET_CASES,
  ...LINEAR_LOOKUP_CASES,
  ...REUSABLE_OBJECT_CASES,
  ...PREPARE_STATEMENT_CASES,
];
