import { RETRY_HINTS } from './retry.mjs';
import { SCOPE_HINTS } from './scopes.mjs';

export const WRITE_HINTS = [...SCOPE_HINTS, ...RETRY_HINTS];
