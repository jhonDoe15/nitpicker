import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TESTS_FAILED_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import { run } from './python-process.mjs';
import { NO_TESTS_EXIT, testCommand, testsRan } from './python-test-runner.mjs';

export const COVERAGE_REPORT = 'coverage.json';
export const COVERAGE_DATA = '.coverage';
export const PYTEST_REPORT = 'pytest-report.json';
const REPORT_PLUGIN = 'nitpicker_pytest_report';
const REPORT_VARIABLE = 'NITPICKER_PYTEST_REPORT';
const PLUGIN_DIRECTORY = path.join(import.meta.dirname, '../test-results');
const COVERAGE_CONFIG = 'coveragerc';
const UNTESTABLE_LINES = [
  String.raw`^\s*if (typing\.)?TYPE_CHECKING:`,
  String.raw`^\s*if __name__ == .__main__.:`,
  String.raw`^\s*@(typing\.)?overload\b`,
  String.raw`^\s*raise NotImplementedError\b`,
];
const TEST_FILES = ['test_*.py', '*_test.py', 'conftest.py', '*/tests/*', '*/test/*'];
const EMPTY_COVERAGE_REPORT = '{"files":{}}';

function existsInside(projectRoot, root) {
  const base = path.resolve(projectRoot);
  const full = `${path.resolve(base, root)}${path.sep}`;
  if (!full.startsWith(`${base}${path.sep}`)) {
    return false;
  }
  return existsSync(full);
}

function coverageSources({ projectRoot, project }) {
  return project.sourceRoots.filter((root) => existsInside(projectRoot, root));
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

function reportPlugin({ project, env, reportRoot }) {
  if (project.testRunner !== 'pytest') {
    return { args: [], env: {} };
  }
  return {
    args: ['-p', REPORT_PLUGIN],
    env: {
      PYTHONPATH: [PLUGIN_DIRECTORY, env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      [REPORT_VARIABLE]: path.join(reportRoot, PYTEST_REPORT),
    },
  };
}

export function test(context, outcome) {
  const sources = coverageSources(context);
  const config = path.join(context.reportRoot, COVERAGE_CONFIG);
  writeFileSync(config, coverageConfig(sources));
  const report = reportPlugin(context);
  const command = ['coverage', 'run', '--rcfile', config, ...testCommand(context), ...report.args];
  const result = run(context, command, {
    accepted: [0, NO_TESTS_EXIT],
    rule: TESTS_FAILED_RULE,
    env: report.env,
  });
  outcome.testsRan = testsRan(result);
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
