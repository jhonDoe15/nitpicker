import { readSlowTestFindings } from '../test-times/slow-tests.mjs';
import { readTestConsoleFindings } from '../test-times/console-findings.mjs';
import { readUnrunTestFindings } from './unrun-tests.mjs';
import { callUntyped } from '../typed/java-values.mts';
import { fieldOf, fieldsOf, listOf } from '../../../../shared/values/readers.mts';

type RunRoots = {
  readonly reportRoot: string;
  readonly projectRoot: string;
  readonly testRoots: readonly string[];
};

export function testRunFindings(
  context: Readonly<Record<string, unknown>>,
  { reportRoot, projectRoot, testRoots }: RunRoots,
): unknown[] {
  if (context['quick'] === true) {
    return [];
  }
  const testTimes = context['testTimes'];
  return [
    ...listOf(
      callUntyped(readSlowTestFindings, {
        reportRoot,
        projectRoot,
        testRoots,
        ...fieldsOf(testTimes),
      }),
    ),
    ...listOf(
      callUntyped(
        readTestConsoleFindings,
        { reportRoot, projectRoot, testRoots },
        context['testConsole'],
      ),
    ),
    ...listOf(
      callUntyped(readUnrunTestFindings, {
        reportRoot,
        projectRoot,
        manifest: context['manifest'],
        modulePath: fieldOf(testTimes, 'modulePath'),
      }),
    ),
  ];
}
