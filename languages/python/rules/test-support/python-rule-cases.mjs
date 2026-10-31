import { EXISTING_CASES } from './cases/existing-cases.mjs';
import { RULES_CASES } from './cases/rules-cases.mjs';
import { SECURITY_CASES } from './cases/security-cases.mjs';
import { STYLE_CASES } from './cases/style-cases.mjs';
import { TYPE_CASES } from './cases/type-cases.mjs';
import { REVIEW_RULE_CASES } from './python-review-rule-cases.mjs';

export const RULE_CASES = [
  ...EXISTING_CASES,
  ...STYLE_CASES,
  ...SECURITY_CASES,
  ...RULES_CASES,
  ...TYPE_CASES,
  ...REVIEW_RULE_CASES,
];
