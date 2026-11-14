import { ROUTE_AUTH_HINTS } from '../auth/route-auth.mjs';
import { DELETED_ITEM_HINTS } from '../deletion/deleted-items.mjs';
import { SOFT_DELETE_HINTS } from '../deletion/soft-delete.mjs';
import { JOB_HINTS } from '../jobs/jobs.mjs';
import { DUAL_WRITE_HINTS } from './dual-write.mjs';
import { RELATED_WRITE_HINTS } from './related-writes.mjs';
import { RETRY_HINTS } from './retry.mjs';
import { SCOPE_HINTS } from './scopes.mjs';

export const WRITE_HINTS = [
  ...SCOPE_HINTS,
  ...RETRY_HINTS,
  ...DUAL_WRITE_HINTS,
  ...RELATED_WRITE_HINTS,
  ...JOB_HINTS,
  ...SOFT_DELETE_HINTS,
  ...DELETED_ITEM_HINTS,
  ...ROUTE_AUTH_HINTS,
];
