import { ENUM_PREDICATE_RULE } from '../../review-rules/enum-predicates.mjs';
import { FORWARDING_RULE } from './main/forwarding-wrappers.mjs';
import { SINGULAR_PLURAL_RULE } from './main/member-names.mjs';
import { CHILD_OUTLIVES_RESOURCE_RULE } from './coroutines/resource-lifetime.mjs';
import { SUSPEND_CLEANUP_RULE } from './coroutines/suspend-cleanup.mjs';
import { UNUSED_OPTION_RULE } from './main/unused-options.mjs';
import { REVIEW_TOOL, SOURCE_TOOL } from './review-finding.mjs';
import { SPRING_UNUSED_CONTEXT_RULE } from './tests/spring-context.mjs';
import { FIXED_SLEEP_RULE } from '../../../messages/wait-advice.mjs';
import { NEGATIVE_WAIT_RULE } from './tests/test-waits.mjs';

export const KOTLIN_REVIEW_EXCEPTION_RULES = [
  FIXED_SLEEP_RULE,
  NEGATIVE_WAIT_RULE,
  SPRING_UNUSED_CONTEXT_RULE,
  ENUM_PREDICATE_RULE,
  FORWARDING_RULE,
  SINGULAR_PLURAL_RULE,
]
  .map((rule) => `${REVIEW_TOOL}/${rule}`)
  .concat(UNUSED_OPTION_RULE)
  .concat(
    [SUSPEND_CLEANUP_RULE, CHILD_OUTLIVES_RESOURCE_RULE].map((rule) => `${SOURCE_TOOL}/${rule}`),
  );
