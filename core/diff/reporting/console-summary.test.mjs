import { describe, expect, it } from 'vitest';
import { renderConsoleSummary } from './summary.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingUrl,
} from '../../../shared/messages/troubleshooting.mjs';

const HELP_LINE = `Help with tool errors: ${troubleshootingUrl(TROUBLESHOOTING_ANCHORS.exitCode2)}`;

const CROPPED_TYPE_ERROR = [
  "error TS2688: Cannot find type definition file for 'node'.",
  'at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)',
  'at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)',
  'at run (stryker.js:1) at run (stryker.js:1) at run (stryker.js:1)… (full text in the diagnostics file)',
].join(' ');

describe('renderConsoleSummary', () => {
  const stackTrace = '  at run (stryker.js:1)\n'.repeat(50);
  const crash = (snapshot) => ({
    tool: 'mutation',
    snapshot,
    message: `Stryker crashed\n${stackTrace}error TS2688: Cannot find type definition file for 'node'.\n${stackTrace}`,
  });
  it('labels each tool error with its snapshot and shows the error line, not the stack', () => {
    const summary = renderConsoleSummary(
      { newFindings: [], toolErrors: [crash('head'), crash('base')] },
      { color: false },
    );

    expect(summary).toEqual(
      [
        '',
        'Quality gate summary',
        'No new enforceable violations, but the run is incomplete:',
        '✖ 2 tool errors',
        `  mutation (head): ${CROPPED_TYPE_ERROR}`,
        `  mutation (base): ${CROPPED_TYPE_ERROR}`,
        HELP_LINE,
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
    expect(summary).not.toContain('✓');
  });
  it('adds no help line when every tool error links its fix', () => {
    const summary = renderConsoleSummary(
      {
        newFindings: [],
        toolErrors: [
          {
            tool: 'coverage',
            snapshot: 'head',
            message: `coverage timed out. See ${troubleshootingUrl(TROUBLESHOOTING_ANCHORS.analyzerTimeout)}`,
          },
        ],
      },
      { color: false },
    );

    expect(summary).toContain(`#${TROUBLESHOOTING_ANCHORS.analyzerTimeout}`);
    expect(summary).not.toContain('Help with tool errors');
  });
  it('keeps the green line when there are no violations and no tool errors', () => {
    const summary = renderConsoleSummary({ newFindings: [], toolErrors: [] }, { color: false });

    expect(summary).toEqual(
      '\nQuality gate summary\n✓ No new enforceable violations\nFull diagnostics: reports/quality/diff/combined/report.txt\n',
    );
  });
  it('lists the failing tests once and drops the skipped analyzers that repeat the cause', () => {
    const testsFailed = (tool, rule, message) => ({ tool, snapshot: 'head', rule, message });
    const summary = renderConsoleSummary(
      {
        newFindings: [],
        toolErrors: [
          testsFailed(
            'coverage',
            'tests-failed',
            '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  test/a.test.ts > adds: expected 1 to be 2',
          ),
          testsFailed(
            'mutation',
            'tests-failed-skipped',
            'mutation skipped: tests fail (see coverage findings)',
          ),
        ],
      },
      { color: false },
    );

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        'No new enforceable violations, but the run is incomplete:',
        '✖ 1 tool error',
        '  coverage (head): 1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
        '    test/a.test.ts > adds: expected 1 to be 2',
        HELP_LINE,
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
    expect(summary).not.toContain('mutation (head)');
  });
  it('shows a skipped analyzer when nothing else names the failing tests', () => {
    const summary = renderConsoleSummary(
      {
        newFindings: [],
        toolErrors: [
          {
            tool: 'mutation',
            snapshot: 'head',
            rule: 'tests-failed-skipped',
            message: 'mutation skipped: tests fail (see coverage findings)',
          },
        ],
      },
      { color: false },
    );

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        'No new enforceable violations, but the run is incomplete:',
        '✖ 1 tool error',
        '  mutation (head): mutation skipped: tests fail (see coverage findings)',
        HELP_LINE,
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
  it('shows a mutation run skipped by a type error as one line', () => {
    const summary = renderConsoleSummary(
      {
        newFindings: [],
        toolErrors: [
          {
            tool: 'mutation',
            snapshot: 'head',
            rule: 'typecheck-failed-skipped',
            message:
              'mutation skipped: the change does not type-check (see typescript-typecheck findings)',
          },
        ],
      },
      { color: false },
    );

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        'No new enforceable violations, but the run is incomplete:',
        '✖ 1 tool error',
        '  mutation (head): mutation skipped: the change does not type-check (see typescript-typecheck findings)',
        HELP_LINE,
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });
  it('collapses repeated findings of one rule and message in one file into a single entry', () => {
    const finding = (line, message = 'Variable is mutable.') => ({
      tool: 'eslint-lint',
      rule: 'functional/prefer-immutable-types',
      path: 'src/main/a.ts',
      message,
      classification: 'enforceable',
      location: { line },
    });
    const summary = renderConsoleSummary(
      {
        newFindings: [finding(26), finding(9), finding(11), finding(12, 'Parameter is mutable.')],
        toolErrors: [],
      },
      { color: false },
    );

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✖ 4 new enforceable violations',
        '  eslint-lint/functional/prefer-immutable-types src/main/a.ts (3 times, lines 9, 11, 26)',
        '    Variable is mutable.',
        '  eslint-lint/functional/prefer-immutable-types src/main/a.ts:12',
        '    Parameter is mutable.',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
    expect(summary.match(/Variable is mutable\./g)).toHaveLength(1);
  });
});
