import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALL_FINDINGS,
  EXPECTED_LOOKUP_FINDINGS,
  MAP_UPDATE_FINDINGS,
  PLURAL_FINDINGS,
  reviewBranchFiles,
  reviewFindings,
} from '../test-support/review/kotlin-review-findings.mts';
import { GENERATED_MEMBER_EXCEPTIONS } from '../test-support/review/members/kotlin-generated-member-data.mts';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from '../__tests__/kotlin-e2e-project.mts';
import type { KotlinProject } from '../__tests__/kotlin-e2e-project.mts';
import { assigned } from '../test-support/views/assigned.mts';
import { ARCHIVE_FILE } from '../test-support/review/kotlin-review-data.mts';
import { SWALLOWED_CANCELLATIONS } from '../test-support/review/swallowed/kotlin-cancellation-data.mts';

const ORDERS_TESTS = 'src/test/kotlin/demo/orders/*';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rule exceptions end to end', () => {
  let project: KotlinProject | undefined;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', reviewBranchFiles(project.root));
  });
  afterAll(() => {
    removeProject(assigned(project, 'project'));
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(assigned(project, 'project'), 'review-rules', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          { rule: 'pmd/FixedSleepInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/FloatEqualityInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/GlobalStateLeakInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/SharedTestState', glob: ORDERS_TESTS },
          { rule: 'pmd/SpringUnusedContext', glob: ORDERS_TESTS },
          { rule: 'pmd/MockedSubjectInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/StaticMockOfProjectType', glob: ORDERS_TESTS },
          { rule: 'unused-option', glob: 'src/main/kotlin/demo/orders/*' },
          { rule: 'pmd/SwallowedInterrupt', glob: 'src/main/kotlin/demo/orders/*' },
          { rule: 'kotlin-source/BlockingCallInCoroutine', glob: ARCHIVE_FILE },
          { rule: 'pmd/ClassLoadEffect', glob: 'src/main/kotlin/demo/orders/Inventory.kt' },
          ...GENERATED_MEMBER_EXCEPTIONS,
        ],
      },
    });

    expect(reviewFindings(result.newEnforceable)).toEqual(
      [
        'ExhaustiveEnumPredicate isHandedOver',
        'ExhaustiveEnumPredicate isLive',
        'ExhaustiveEnumPredicate isOpen',
        'ExhaustiveEnumPredicate isPending',
        'ExhaustiveEnumPredicate isSettled',
        'ExhaustiveEnumPredicate weight',
        ...EXPECTED_LOOKUP_FINDINGS,
        ...PLURAL_FINDINGS,
        'StaticForwardingWrapper absOf',
        'StaticForwardingWrapper total',
        'ForwardingMethodAlias Cart.count',
        'ForwardingMethodAlias Cart.visible',
        ...MAP_UPDATE_FINDINGS,
        ...ALL_FINDINGS.filter((entry) =>
          /^(?:InconsistentFieldLocking|LockOrderInversion|NonAtomicUpdateAcrossSuspension) /u.test(
            entry,
          ),
        ),
        ...SWALLOWED_CANCELLATIONS,
        'TimeoutWithoutSuspension Archive.timesOutBlockingWork.withTimeout',
        'timeout-abandons-operation awaitAllOutside:withTimeout:first',
        'timeout-abandons-operation awaitAllOutside:withTimeout:second',
        'timeout-abandons-operation awaitOutside:withTimeout:work',
        'timeout-abandons-operation boundedAsync:orTimeout:supplyAsync',
        'timeout-abandons-operation cancelAsyncTask:get:future',
        'timeout-abandons-operation giveUp:get:future',
        'timeout-abandons-operation shutDownLetsItFinish:get:future',
      ].sort(),
    );
  });
});
