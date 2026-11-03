import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TESTS_NOT_RUN_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { failure, run } from '../execution/python-process.mjs';
import {
  NO_TESTS_EXIT,
  testCommand,
  testDirectory,
  testEnvironment,
  testsRan,
} from '../execution/python-test-runner.mjs';
import { insideProject } from '../../libraries/project-files.mjs';
import { writeCoverageConfig } from '../configuration/coverage-config/python-coverage-config.mjs';
import { failedTests, readJunit } from './junit-results.mjs';
import { unittestFailures } from './test-failures.mjs';

export const COVERAGE_REPORT = 'coverage.json';
const COVERAGE_DATA = '.coverage';
const TESTS_FAILED_EXIT = 1;
const EMPTY_COVERAGE_REPORT = '{"files":{}}';

function coverageSources({ projectRoot, project }) {
  return project.sourceRoots.filter((root) => existsSync(insideProject(projectRoot, root)));
}

function combineCoverageData(context, config) {
  const parallel = readdirSync(context.reportRoot).some((name) =>
    name.startsWith(`${COVERAGE_DATA}.`),
  );
  if (parallel) {
    run(context, ['coverage', 'combine', '--rcfile', config], { rule: 'coverage-failed' });
  }
}

function failuresOf(context, { command, result }) {
  if (result.status !== TESTS_FAILED_EXIT) {
    return [];
  }
  const failed =
    context.project.testRunner === 'pytest'
      ? failedTests(readJunit(context.reportRoot)).map(({ id, file, name }) => ({
          id,
          file,
          notRun: name === undefined,
        }))
      : unittestFailures(result.stderr);
  if (failed.length === 0) {
    throw failure({ context, command, result, rule: TESTS_NOT_RUN_RULE });
  }
  return failed;
}

export function test(context, outcome) {
  const sources = coverageSources(context);
  const config = writeCoverageConfig(context, sources);
  const command = ['coverage', 'run', '--rcfile', config, ...testCommand(context)];
  const result = run(context, command, {
    accepted: [0, TESTS_FAILED_EXIT, NO_TESTS_EXIT],
    rule: TESTS_NOT_RUN_RULE,
    env: testEnvironment(context),
    cwd: testDirectory(context),
  });
  outcome.testsRan = testsRan(result);
  outcome.testFailures = failuresOf(context, { command, result });
  combineCoverageData(context, config);
  writeCoverageReport(context, { config, measured: sources.length > 0 });
}

function writeCoverageReport(context, { config, measured }) {
  const report = path.join(context.reportRoot, COVERAGE_REPORT);
  if (!measured) {
    writeFileSync(report, EMPTY_COVERAGE_REPORT);
    return;
  }
  run(
    context,
    ['coverage', 'json', '--rcfile', config, '-o', report, '--fail-under=0', '--ignore-errors'],
    { rule: 'coverage-failed' },
  );
}
