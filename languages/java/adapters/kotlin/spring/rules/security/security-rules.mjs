import { CORS_RULES } from './cors-rule.mjs';
import { CSRF_RULES } from './csrf-rule.mjs';
import { HARDCODED_USER_RULES } from './hardcoded-user-rule.mjs';
import { PERMIT_ALL_RULES } from './permit-all-rule.mjs';

export const SECURITY_RULES = [
  ...PERMIT_ALL_RULES,
  ...CSRF_RULES,
  ...CORS_RULES,
  ...HARDCODED_USER_RULES,
];
