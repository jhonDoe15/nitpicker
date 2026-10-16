import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { failure, run } from '../execution/python-process.mjs';
import {
  NO_TESTS_EXIT,
  testCommand,
  testEnvironment,
  testsRan,
} from '../execution/python-test-runner.mjs';
import { insideProject } from '../../libraries/project-files.mjs';
import { failedTests, readJunit } from './junit-results.mjs';
import { unittestFailures } from './test-failures.mjs';

export const COVERAGE_REPORT = 'coverage.json';
const COVERAGE_CONFIG = 'coveragerc';
const TESTS_FAILED_EXIT = 1;
const UNTESTABLE_LINES = [
  String.raw`^\s*if (typing\.)?TYPE_CHECKING:`,
  String.raw`^\s*if __name__ == .__main__.:`,
  String.raw`^\s*@(typing\.)?overload\b`,
  String.raw`^\s*raise NotImplementedError\b`,
];
const TEST_FILES = ['test_*.py', '*_test.py', 'conftest.py', '*/tests/*', '*/test/*'];
const EMPTY_COVERAGE_REPORT = '{"files":{}}';

function coverageSources({ projectRoot, project }) {
  return project.sourceRoots.filter((root) => existsSync(insideProject(projectRoot, root)));
}

function indented(entries) {
  return entries.map((entry) => `    ${entry}`).join('\n');
}

function coverageConfig(sources) {
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    `source =\n${indented(sources)}`,
    `omit =\n${indented(TEST_FILES)}`,
    '[report]',
    `exclude_lines =\n${indented(UNTESTABLE_LINES)}`,
    'partial_branches =',
    '',
  ].join('\n');
}

function failuresOf(context, { command, result }) {
  if (result.status !== TESTS_FAILED_EXIT) {
    return [];
  }
  const failed =
    context.project.testRunner === 'pytest'
      ? failedTests(readJunit(context.reportRoot)).map(({ id, file }) => ({ id, file }))
      : unittestFailures(result.stderr);
  if (failed.length === 0) {
    throw failure({ context, command, result, rule: TESTS_FAILED_RULE });
  }
  return failed;
}

export function test(context, outcome) {
  const sources = coverageSources(context);
  const config = path.join(context.reportRoot, COVERAGE_CONFIG);
  writeFileSync(config, coverageConfig(sources));
  const command = ['coverage', 'run', '--rcfile', config, ...testCommand(context)];
  const result = run(context, command, {
    accepted: [0, TESTS_FAILED_EXIT, NO_TESTS_EXIT],
    rule: TESTS_FAILED_RULE,
    env: testEnvironment(context),
  });
  outcome.testsRan = testsRan(result);
  outcome.testFailures = failuresOf(context, { command, result });
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
