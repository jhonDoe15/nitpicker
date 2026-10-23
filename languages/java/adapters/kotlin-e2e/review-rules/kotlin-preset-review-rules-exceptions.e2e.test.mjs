import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REVIEW_RULE_FILES } from '../test-support/review/kotlin-review-data.mjs';
import { reviewFindings } from '../test-support/review/kotlin-review-findings.mjs';
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
    commitBranch(project, 'review-rules', REVIEW_RULE_FILES);
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
          { rule: 'pmd/SpringUnusedContext', glob: ORDERS_TESTS },
          { rule: 'unused-option', glob: 'src/main/kotlin/demo/orders/*' },
        ],
      },
    });

    expect(reviewFindings(result.newEnforceable)).toEqual([
      'ExhaustiveEnumPredicate isLive',
      'ExhaustiveEnumPredicate isOpen',
      'ExhaustiveEnumPredicate isSettled',
      'ExhaustiveEnumPredicate weight',
      'SingularAndPluralMember Query.tags',
      'StaticForwardingWrapper absOf',
      'StaticForwardingWrapper total',
    ]);
  });
});
