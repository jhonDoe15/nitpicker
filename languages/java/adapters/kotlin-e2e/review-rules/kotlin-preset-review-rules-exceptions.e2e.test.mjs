import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAP_UPDATE_FINDINGS,
  PLURAL_FINDINGS,
  reviewBranchFiles,
  reviewFindings,
} from '../test-support/review/kotlin-review-findings.mjs';
import { GENERATED_MEMBER_EXCEPTIONS } from '../test-support/review/members/kotlin-generated-member-data.mjs';
import {
  commitBranch,
  diffOf,
  initializeProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
} from '../test-support/kotlin-e2e-project.mjs';

const ORDERS_TESTS = 'src/test/kotlin/demo/orders/*';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset review rule exceptions end to end', () => {
  let project;

  beforeAll(() => {
    project = initializeProject();
    commitBranch(project, 'review-rules', reviewBranchFiles());
  });
  afterAll(() => {
    removeProject(project);
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(project, 'review-rules', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          { rule: 'pmd/FixedSleepInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/GlobalStateLeakInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/SharedTestState', glob: ORDERS_TESTS },
          { rule: 'pmd/SpringUnusedContext', glob: ORDERS_TESTS },
          { rule: 'pmd/MockedSubjectInTest', glob: ORDERS_TESTS },
          { rule: 'pmd/StaticMockOfProjectType', glob: ORDERS_TESTS },
          { rule: 'unused-option', glob: 'src/main/kotlin/demo/orders/*' },
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
        ...PLURAL_FINDINGS,
        'StaticForwardingWrapper absOf',
        'StaticForwardingWrapper total',
        ...MAP_UPDATE_FINDINGS,
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
