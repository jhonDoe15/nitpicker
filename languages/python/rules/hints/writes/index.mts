import { ROUTE_AUTH_HINTS } from '../auth/route-auth.mts';
import { DELETED_ITEM_HINTS, SOFT_DELETE_HINTS } from '../deletion/deletion-hints.mts';
import { JOB_HINTS } from '../jobs/jobs.mts';
import { DUAL_WRITE_HINTS } from './dual-write.mts';
import { RELATED_WRITE_HINTS } from './related-writes.mts';
import { RETRY_HINTS } from './retry.mts';
import { SCOPE_HINTS } from './scopes.mts';
import type { RuleHint } from '../hint-types.mts';

export const WRITE_HINTS: readonly RuleHint[] = [
  ...SCOPE_HINTS,
  ...RETRY_HINTS,
  ...DUAL_WRITE_HINTS,
  ...RELATED_WRITE_HINTS,
  ...JOB_HINTS,
  ...SOFT_DELETE_HINTS,
  ...DELETED_ITEM_HINTS,
  ...ROUTE_AUTH_HINTS,
];
