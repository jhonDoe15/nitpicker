import { DUAL_WRITE_HINTS } from './dual-write.mts';
import { RETRY_HINTS } from './retry.mts';
import { SCOPE_HINTS } from './scopes.mts';
import type { RuleHint } from '../hint-types.mts';

export const WRITE_HINTS: readonly RuleHint[] = [
  ...SCOPE_HINTS,
  ...RETRY_HINTS,
  ...DUAL_WRITE_HINTS,
];
