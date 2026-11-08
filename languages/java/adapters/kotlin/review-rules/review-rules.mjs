import { ENUM_PREDICATE_RULE } from '../../review-rules/enum-predicates.mjs';
import {
  SWALLOWED_CANCELLATION_RULE,
  SWALLOWED_INTERRUPT_RULE,
} from './handlers/swallowed-handlers.mjs';
import { LOAD_EFFECT_RULE } from '../../../messages/load-effects.mjs';
import { FORWARDING_RULE } from './main/forwarding/forwarding-wrappers.mjs';
import { METHOD_ALIAS_RULE } from './main/forwarding/method-aliases.mjs';
import { FIELD_LOCKING_RULE, LOCK_ORDER_RULE } from '../../../messages/locking/lock-evidence.mjs';
import { SINGULAR_PLURAL_RULE } from './main/member-names.mjs';
import { TIMEOUT_RULE } from './main/timeouts/timeouts.mjs';
import { SUSPENDED_UPDATE_RULE } from './main/suspension/suspended-updates.mjs';
import { RECURSIVE_MAP_UPDATE_RULE } from './main/map-updates/recursive-map-update.mjs';
import { CHILD_OUTLIVES_RESOURCE_RULE } from './coroutines/resource-lifetime.mjs';
import { SUSPEND_CLEANUP_RULE } from './coroutines/suspend-cleanup.mjs';
import { UNBOUNDED_POOL_RULE } from './main/thread-pools/unbounded-pools.mjs';
import { UNUSED_OPTION_RULE } from './main/unused-options/unused-options.mjs';
import { VALIDATION_TARGET_RULE } from './validation/validation-targets.mjs';
import { REVIEW_TOOL, SOURCE_TOOL } from './review-finding.mjs';
import { JAVA_ONLY_SPRING_RULE, SPRING_RULES } from './spring/spring-messages.mjs';
import { SPRING_UNUSED_CONTEXT_RULE } from './tests/spring-context.mjs';
import { FIXED_SLEEP_RULE } from '../../../messages/wait-advice.mjs';
import { HONESTY_RULES } from './tests/test-honesty.mjs';
import { NEGATIVE_WAIT_RULE } from './tests/test-waits.mjs';
import { MOCKED_SUBJECT_RULE, STATIC_MOCK_RULE } from '../../../messages/mocks/project-mocks.mjs';

export const KOTLIN_REVIEW_EXCEPTION_RULES = [
  FIXED_SLEEP_RULE,
  NEGATIVE_WAIT_RULE,
  ...HONESTY_RULES,
  MOCKED_SUBJECT_RULE,
  STATIC_MOCK_RULE,
  SPRING_UNUSED_CONTEXT_RULE,
  ENUM_PREDICATE_RULE,
  FORWARDING_RULE,
  METHOD_ALIAS_RULE,
  SINGULAR_PLURAL_RULE,
  TIMEOUT_RULE,
  SUSPENDED_UPDATE_RULE,
  SWALLOWED_INTERRUPT_RULE,
  SWALLOWED_CANCELLATION_RULE,
  LOCK_ORDER_RULE,
  FIELD_LOCKING_RULE,
  VALIDATION_TARGET_RULE,
  LOAD_EFFECT_RULE,
  UNBOUNDED_POOL_RULE,
  RECURSIVE_MAP_UPDATE_RULE,
  ...SPRING_RULES,
  JAVA_ONLY_SPRING_RULE,
]
  .map((rule) => `${REVIEW_TOOL}/${rule}`)
  .concat(UNUSED_OPTION_RULE)
  .concat(
    [SUSPEND_CLEANUP_RULE, CHILD_OUTLIVES_RESOURCE_RULE].map((rule) => `${SOURCE_TOOL}/${rule}`),
  );
