import { DUAL_WRITE_HINTS } from './dual-write.mjs';
import { RETRY_HINTS } from './retry.mjs';
import { SCOPE_HINTS } from './scopes.mjs';

export const WRITE_HINTS = [...SCOPE_HINTS, ...RETRY_HINTS, ...DUAL_WRITE_HINTS];
