import { describe, expect, it } from 'vitest';
import { comparisonExitCode, failingHeadTests } from './failing-tests.mts';
import { renderConsoleSummary } from '../summary.mts';
import { renderDiffSummary } from '../github/diff-summary.mts';
import { finding, report } from '../test-support/report-builders.mjs';
import { formatTestFailures } from '../../../../languages/typescript/adapters/quality-areas/reporting/test-report.mjs';
import { failingTestsError } from '../../../../languages/java/builds/test-failures.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingUrl,
} from '../../../../shared/messages/troubleshooting.mjs';
import { testFailureFindings } from '../../../../languages/python/adapters/test-runs/test-failures.mjs';

const HELP_LINE = `Help with tool errors: ${troubleshootingUrl(TROUBLESHOOTING_ANCHORS.exitCode2)}`;

const TS_MESSAGE = formatTestFailures(
  {
    numFailedTests: 1,
    testResults: [
      {
        name: '/p/test/a.test.ts',
        assertionResults: [
          { status: 'failed', fullName: 'adds', failureMessages: ['expected 1 to be 2'] },
        ],
      },
    ],
  },
  '/p',
);
const JAVA_MESSAGE = failingTestsError([
  { module: '.', tests: ['shop.CartTest.adds: expected: <2> but was: <1>'] },
]).message;
const [{ message: PYTHON_MESSAGE }] = testFailureFindings({
  testRunner: 'unittest',
  testFailures: [{ id: 'tests.test_cart.CartTest.test_adds' }],
});

const PRESET_MESSAGES = [
  ['TypeScript', 'coverage', TS_MESSAGE],
  ['Java', 'java', JAVA_MESSAGE],
  ['Python', 'tests', PYTHON_MESSAGE],
];

function testsFailed(tool, message, snapshot = 'head') {
  return { tool, snapshot, rule: 'tests-failed', path: '.', message };
}

const MUTATION_CRASH = { tool: 'mutation', snapshot: 'head', message: 'Error: Stryker crashed' };
const DIAGNOSTICS = 'Full diagnostics: reports/quality/diff/combined/report.txt';

function consoleLines(value) {
  return renderConsoleSummary(value, { color: false }).split('\n');
}

describe('failing head tests', () => {
  it.each(PRESET_MESSAGES)(
    'lead the %s summary when they are the only problem, and exit 1',
    (_, tool, message) => {
      const value = report({ toolErrors: [testsFailed(tool, message)] });
      const [headline, ...listed] = message.split('\n');

      expect(consoleLines(value)).toEqual([
        '',
        'Quality gate summary',
        `✖ ${headline}`,
        ...listed,
        'No new enforceable violations in the checks that ran.',
        DIAGNOSTICS,
        '',
      ]);
      expect(headline).toMatch(/^1 test fails; .+\. Fix the tests and rerun:$/u);
      expect(comparisonExitCode(value)).toBe(1);
    },
  );

  it.each(PRESET_MESSAGES)(
    'come before the %s violations, and the run exits 1',
    (_, tool, message) => {
      const value = report({
        newFindings: [finding()],
        toolErrors: [testsFailed(tool, message)],
      });
      const lines = consoleLines(value);

      expect(lines[2]).toBe(`✖ ${message.split('\n')[0]}`);
      expect(lines.indexOf('✖ 1 new enforceable violation')).toBeGreaterThan(2);
      expect(lines.join('\n')).not.toContain('tool error');
      expect(comparisonExitCode(value)).toBe(1);
    },
  );

  it.each(PRESET_MESSAGES)(
    'still lead the %s summary next to another tool error, and the run exits 1',
    (_, tool, message) => {
      const value = report({ toolErrors: [testsFailed(tool, message), MUTATION_CRASH] });
      const lines = consoleLines(value);

      expect(lines.slice(0, 3)).toEqual([
        '',
        'Quality gate summary',
        `✖ ${message.split('\n')[0]}`,
      ]);
      expect(lines.slice(-6)).toEqual([
        'No new enforceable violations, but the run is incomplete:',
        '✖ 1 tool error',
        '  mutation (head): Error: Stryker crashed',
        HELP_LINE,
        DIAGNOSTICS,
        '',
      ]);
      expect(comparisonExitCode(value)).toBe(1);
    },
  );

  it('name the tool when more than one test run fails', () => {
    const value = report({
      toolErrors: [testsFailed('coverage', TS_MESSAGE), testsFailed('tests', PYTHON_MESSAGE)],
    });

    expect(consoleLines(value).filter((line) => line.startsWith('✖'))).toEqual([
      `✖ coverage: ${TS_MESSAGE.split('\n')[0]}`,
      `✖ tests: ${PYTHON_MESSAGE.split('\n')[0]}`,
    ]);
  });

  it('do not count tests that fail only on the base, which stay a tool error with exit 2', () => {
    const value = report({
      toolErrors: [testsFailed('coverage', 'Tests fail on the base:', 'base')],
    });

    expect(failingHeadTests(value.toolErrors)).toEqual([]);
    expect(consoleLines(value)[2]).toBe(
      'No new enforceable violations, but the run is incomplete:',
    );
    expect(comparisonExitCode(value)).toBe(2);
  });

  it('keep exit 2 for another tool error alone and exit 0 for a clean run', () => {
    expect(comparisonExitCode(report({ toolErrors: [MUTATION_CRASH] }))).toBe(2);
    expect(comparisonExitCode(report())).toBe(0);
  });

  it('show ten failing tests with their details and point to the report for the rest', () => {
    const entries = Array.from({ length: 12 }, (_, index) => [
      `  test/a.test.ts:${String(index + 1)} > case ${String(index)}: expected 1 to be 2`,
      '    expected: { "kind": "no" }',
      '    received: { "kind": "yes" }',
    ]);
    const message = [
      '12 tests fail; coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
      ...entries.flat(),
      '  and 3 more',
      'Hint: the test runs without a DOM.',
    ].join('\n');
    const lines = consoleLines(report({ toolErrors: [testsFailed('coverage', message)] }));

    expect(lines.slice(2, -3)).toEqual([
      `✖ ${message.split('\n')[0]}`,
      ...entries.slice(0, 10).flat(),
      `  … and 5 more; see ${DIAGNOSTICS.replace('Full diagnostics: ', '')}`,
      'Hint: the test runs without a DOM.',
    ]);
  });

  it('lead the GitHub step summary', () => {
    const context = { projectPrefix: '' };
    const alone = report({ toolErrors: [testsFailed('java', JAVA_MESSAGE)] });
    const withFindings = report({
      newFindings: [finding()],
      toolErrors: [testsFailed('java', JAVA_MESSAGE)],
    });

    const headlineOf = (value) => renderDiffSummary(value, context).split('\n')[2];

    expect(headlineOf(alone)).toBe(`**✖ ${JAVA_MESSAGE.split('\n')[0].replace(/:$/u, '')}**`);
    expect(headlineOf(withFindings)).toBe('**✖ 1 new enforceable finding, and tests fail**');
  });
});
