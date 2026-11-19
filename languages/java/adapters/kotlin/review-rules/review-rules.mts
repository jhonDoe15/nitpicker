import { BLOCKING_RULES } from './blocking/blocking-findings.mts';
import { ENUM_PREDICATE_RULE } from '../../review-rules/enum-predicates.mts';
import {
  SWALLOWED_CANCELLATION_RULE,
  SWALLOWED_INTERRUPT_RULE,
} from './handlers/swallowed-handlers.mts';
import { LOAD_EFFECT_RULE } from '../../../messages/load-effects.mts';
import { FORWARDING_RULE } from './main/forwarding/forwarding-wrappers.mts';
import { METHOD_ALIAS_RULE } from './main/forwarding/method-aliases.mts';
import { FIELD_LOCKING_RULE, LOCK_ORDER_RULE } from '../../../messages/locking/lock-evidence.mts';
import {
  MEMBER_CYCLE_RULE,
  SKIPPED_SUPER_RULE,
} from './main/generated-members/generated-members.mts';
import { REUSABLE_OBJECT_RULE } from '../../../messages/reuse/reusable-objects.mts';
import { SINGULAR_PLURAL_RULE } from './main/member-names.mts';
import { STREAMED_ROWS_RULE } from './main/streamed-rows/streamed-rows.mts';
import { TIMEOUT_RULE } from './main/timeouts/timeouts.mts';
import { SUSPENDED_UPDATE_RULE } from './main/suspension/suspended-updates.mts';
import { RECURSIVE_MAP_UPDATE_RULE } from './main/map-updates/recursive-map-update.mts';
import { CHILD_OUTLIVES_RESOURCE_RULE } from './coroutines/resource-lifetime.mts';
import { SUSPEND_CLEANUP_RULE } from './coroutines/suspend-cleanup.mts';
import { SERVICE_LOOKUP_RULE } from './main/service-lookups/service-lookups.mts';
import { UNBOUNDED_POOL_RULE } from './main/thread-pools/unbounded-pools.mts';
import { UNUSED_OPTION_RULE } from './main/unused-options/unused-options.mts';
import { VALIDATION_TARGET_RULE } from './validation/validation-targets.mts';
import { REVIEW_TOOL, SOURCE_TOOL } from './review-finding.mts';
import { JAVA_ONLY_SPRING_RULE, SPRING_RULES } from './spring/spring-messages.mts';
import { SPRING_UNUSED_CONTEXT_RULE } from './tests/spring-context.mts';
import { FIXED_SLEEP_RULE } from '../../../messages/wait-advice.mts';
import { HONESTY_RULES } from './tests/test-honesty.mts';
import { NEGATIVE_WAIT_RULE } from './tests/test-waits.mts';
import { RELAXED_MOCK_RULE } from './tests/mocks/relaxed-mocks.mts';
import { MOCKED_SUBJECT_RULE, STATIC_MOCK_RULE } from '../../../messages/mocks/project-mocks.mts';

export const KOTLIN_REVIEW_EXCEPTION_RULES = [
  FIXED_SLEEP_RULE,
  NEGATIVE_WAIT_RULE,
  ...HONESTY_RULES,
  MOCKED_SUBJECT_RULE,
  STATIC_MOCK_RULE,
  RELAXED_MOCK_RULE,
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
  SERVICE_LOOKUP_RULE,
  VALIDATION_TARGET_RULE,
  LOAD_EFFECT_RULE,
  UNBOUNDED_POOL_RULE,
  RECURSIVE_MAP_UPDATE_RULE,
  STREAMED_ROWS_RULE,
  REUSABLE_OBJECT_RULE,
  MEMBER_CYCLE_RULE,
  SKIPPED_SUPER_RULE,
  ...SPRING_RULES,
  JAVA_ONLY_SPRING_RULE,
]
  .map((rule) => `${REVIEW_TOOL}/${rule}`)
  .concat(UNUSED_OPTION_RULE)
  .concat(
    [SUSPEND_CLEANUP_RULE, CHILD_OUTLIVES_RESOURCE_RULE].map((rule) => `${SOURCE_TOOL}/${rule}`),
  )
  .concat(BLOCKING_RULES.map((rule) => `${SOURCE_TOOL}/${rule}`));
