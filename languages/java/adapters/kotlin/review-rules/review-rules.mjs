import { ENUM_PREDICATE_RULE } from '../../review-rules/enum-predicates.mjs';
import { LOAD_EFFECT_RULE } from '../../../messages/load-effects.mjs';
import { FORWARDING_RULE } from './main/forwarding/forwarding-wrappers.mjs';
import { METHOD_ALIAS_RULE } from './main/forwarding/method-aliases.mjs';
import { SINGULAR_PLURAL_RULE } from './main/member-names.mjs';
import { UNUSED_OPTION_RULE } from './main/unused-options.mjs';
import { VALIDATION_TARGET_RULE } from './validation/validation-targets.mjs';
import { REVIEW_TOOL } from './review-finding.mjs';
import { JAVA_ONLY_SPRING_RULE, SPRING_RULES } from './spring/spring-messages.mjs';
import { SPRING_UNUSED_CONTEXT_RULE } from './tests/spring-context.mjs';
import { FIXED_SLEEP_RULE } from '../../../messages/wait-advice.mjs';
import { HONESTY_RULES } from './tests/test-honesty.mjs';
import { NEGATIVE_WAIT_RULE } from './tests/test-waits.mjs';

export const KOTLIN_REVIEW_EXCEPTION_RULES = [
  FIXED_SLEEP_RULE,
  NEGATIVE_WAIT_RULE,
  ...HONESTY_RULES,
  SPRING_UNUSED_CONTEXT_RULE,
  ENUM_PREDICATE_RULE,
  FORWARDING_RULE,
  METHOD_ALIAS_RULE,
  SINGULAR_PLURAL_RULE,
  VALIDATION_TARGET_RULE,
  LOAD_EFFECT_RULE,
  ...SPRING_RULES,
  JAVA_ONLY_SPRING_RULE,
]
  .map((rule) => `${REVIEW_TOOL}/${rule}`)
  .concat(UNUSED_OPTION_RULE);
