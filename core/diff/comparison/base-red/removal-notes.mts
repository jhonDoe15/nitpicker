import type { TouchedCode } from '../model/finding-types.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { removedTestTargetsFor } from './unknown-base.mts';

const TESTS_REMOVED_MESSAGE = [
  'The change removes tests, so the base cannot show what they covered:',
  'every coverage, CRAP, mutation, slow-test and test-console result of the head counts as new.',
].join(' ');

const TARGETS_REMOVED_MESSAGE = [
  'The change removes tests, so the base cannot show what they covered:',
  'every coverage, CRAP, mutation, slow-test and test-console result in the files they import directly',
  'counts as new.',
].join(' ');

export function removalNotes(
  failureNotes: readonly ReportEntry[],
  touchedCode: Pick<TouchedCode, 'testsRemoved' | 'removedTestTargets'> | undefined,
): ReportEntry[] {
  const narrowed = removedTestTargetsFor(failureNotes, touchedCode) !== undefined;
  return failureNotes.length === 0
    ? []
    : [
        {
          tool: 'nitpicker',
          snapshot: 'head',
          rule: 'tests-removed',
          path: '.',
          message: narrowed ? TARGETS_REMOVED_MESSAGE : TESTS_REMOVED_MESSAGE,
        },
      ];
}
