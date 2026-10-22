import path from 'node:path';
import { escapeRegExp } from '../../../../shared/paths/glob.mjs';
import { runProjectTests } from '../test-runners/run-project-tests.mjs';
import { passedRuns, runKey } from './report-runs.mjs';

function rerunSelection(projectRoot, suspects) {
  const files = new Set(suspects.map(({ file }) => path.join(projectRoot, file)));
  const names = new Set(suspects.map(({ name }) => escapeRegExp(name)));
  return { files: [...files], namePattern: `^(?:${[...names].join('|')})$` };
}

export async function retimeWithoutCoverage(options, suspects) {
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
