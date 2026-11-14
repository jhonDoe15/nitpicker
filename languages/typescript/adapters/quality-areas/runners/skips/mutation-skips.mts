import {
  TYPECHECK_FAILED_SKIPPED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
} from '../../../../../../shared/rules/finding-helpers.mjs';
import { TROUBLESHOOTING_ANCHORS } from '../../../../../../shared/messages/troubleshooting.mjs';

const INITIAL_TEST_RUN_FAILED_PATTERN =
  /failed tests in the initial test run|Something went wrong in the initial test run/u;

const DRY_RUN_TYPECHECK_FAILED_PATTERN = /Typescript error\(s\) found in dry run compilation/u;

type Skip = { readonly message: string; readonly anchor?: string };

type SkipFinding = {
  readonly rule: string;
  readonly message: string;
  readonly anchor: string | undefined;
};

const SKIPS: Readonly<Record<'head' | 'base', { readonly typecheck: Skip; readonly tests: Skip }>> =
  {
    head: {
      typecheck: {
        message:
          'mutation skipped: the project does not type-check under the mutation checker configuration (see differential typescript-typecheck findings)',
      },
      tests: {
        message: 'mutation skipped: tests fail (see coverage findings)',
      },
    },
    base: {
      typecheck: {
        message:
          'mutation skipped: the base commit does not type-check, so its mutants cannot be compared. Fix the base first; a missing @types/node is the usual cause.',
        anchor: TROUBLESHOOTING_ANCHORS.baseDoesNotTypeCheck,
      },
      tests: {
        message:
          'mutation skipped: the base commit fails its own tests, so its mutants are unknown there.',
        anchor: TROUBLESHOOTING_ANCHORS.baseTestsFail,
      },
    },
  };

export function mutationSkipFor(
  errorMessage: string,
  snapshot: 'head' | 'base' = 'head',
): SkipFinding | undefined {
  const skips = SKIPS[snapshot];
  if (DRY_RUN_TYPECHECK_FAILED_PATTERN.test(errorMessage)) {
    return { rule: TYPECHECK_FAILED_SKIPPED_RULE, anchor: undefined, ...skips.typecheck };
  }
  return INITIAL_TEST_RUN_FAILED_PATTERN.test(errorMessage)
    ? { rule: TESTS_FAILED_SKIPPED_RULE, anchor: undefined, ...skips.tests }
    : undefined;
}
