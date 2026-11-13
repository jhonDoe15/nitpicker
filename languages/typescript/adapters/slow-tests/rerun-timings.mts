import path from 'node:path';
import { escapeRegExp } from '../typed/tooling.mts';
import type { Rerun, TestOptions } from '../test-runners/typed/runner-types.mts';
import type { TestRunTime } from './slow-test-rules.mts';
import { runProjectTests } from '../test-runners/run-project-tests.mts';
import { passedRuns, runKey } from './report-runs.mts';

function rerunSelection(projectRoot: string, suspects: readonly TestRunTime[]): Rerun {
  const files = new Set(suspects.map(({ file }) => path.join(projectRoot, file)));
  const names = new Set(suspects.map(({ name }) => escapeRegExp(name)));
  return { files: [...files], namePattern: `^(?:${[...names].join('|')})$` };
}

export async function retimeWithoutCoverage(
  options: TestOptions,
  suspects: readonly TestRunTime[],
): Promise<Map<string, number>> {
  try {
    const run = await runProjectTests({
      ...options,
      rerun: rerunSelection(options.projectRoot, suspects),
    });
    return new Map(
      passedRuns(run.report, options.projectRoot).map((rerun) => [runKey(rerun), rerun.seconds]),
    );
  } catch (error) {
    throw new Error('Could not rerun slow tests without coverage', { cause: error });
  }
}
