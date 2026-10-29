import { readSlowTestFindings } from '../test-times/slow-tests.mjs';
import { readTestConsoleFindings } from '../test-times/console-findings.mjs';
import { readUnrunTestFindings } from './unrun-tests.mjs';

export function testRunFindings(context, { reportRoot, projectRoot, testRoots }) {
  if (context.quick) {
    return [];
  }
  return [
    ...readSlowTestFindings({ reportRoot, projectRoot, testRoots, ...context.testTimes }),
    ...readTestConsoleFindings({ reportRoot, projectRoot, testRoots }, context.testConsole),
    ...readUnrunTestFindings({
      reportRoot,
      projectRoot,
      manifest: context.manifest,
      modulePath: context.testTimes.modulePath,
    }),
  ];
}
