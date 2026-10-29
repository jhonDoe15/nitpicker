import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../../tooling/tool-resolution.mjs';
import { runAnalyzers } from '../../../execution/run-analyzers.mjs';
import {
  coverageFailureFindings,
  formatTestFailures,
} from '../../../../../languages/typescript/adapters/quality-areas/reporting/test-report.mjs';
import { compareFindings } from '../../../comparison/compare.mjs';
import { describeUncoveredArms } from '../../../../../languages/typescript/adapters/quality-areas/reporting/source-hashes.mjs';
import { normalizeCoverage } from '../../../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';
import { fileURLToPath } from 'node:url';

describe('coverage reporting in the quality-area analyzers', () => {
  it('skips CRAP, without a tool error of its own, when coverage reports failing tests', () => {
    const analyzer = (name, dependencies, report) => ({
      name,
      dependencies,
      version: '1.0.0',
      configurationHash: 'test',
      exclusions: [],
      createInvocation: () => ({
        command: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(JSON.stringify(report))})`],
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      }),
    });
    const testsFailed = {
      tool: 'coverage',
      rule: 'tests-failed',
      path: 'test/a.test.ts',
      identity: 'tests-failed',
      message: '1 test fails',
      classification: 'tool-error',
    };
    const result = runAnalyzers({
      analyzers: [
        analyzer('coverage', [], { findings: [testsFailed] }),
        analyzer('crap', ['coverage'], { findings: [] }),
      ],
      projectRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      policyRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      toolRoot: fileURLToPath(new URL('../../../', import.meta.url)),
      liveProjectRoot: PACKAGE_ROOT,
      snapshot: 'head',
    });

    expect([...result.reports.keys()]).toEqual(['coverage']);
    expect(result.toolErrors).toEqual([]);
    expect(result.skipped.get('crap')).toBe('coverage');
  });
  it('names each failing test with its file and first assertion line', () => {
    const message = formatTestFailures(
      {
        numFailedTests: 2,
        testResults: [
          {
            name: '/workspace/test/example.test.ts',
            assertionResults: [
              {
                fullName: 'example rejects invalid input',
                status: 'failed',
                failureMessages: ['AssertionError: expected 500 to be 400\n    at run (x.js:1:1)'],
              },
              { fullName: 'example passes', status: 'passed', failureMessages: [] },
              {
                fullName: 'example other',
                status: 'failed',
                failureMessages: ['\u001B[31mexpected [] to have a length of 1\u001B[39m'],
              },
            ],
          },
        ],
      },
      '/workspace',
    );

    expect(message).toBe(
      '2 tests fail, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
        '  test/example.test.ts > example rejects invalid input: AssertionError: expected 500 to be 400\n' +
        '  test/example.test.ts > example other: expected [] to have a length of 1',
    );
  });
  it('keeps the process output when Vitest fails without naming a test', () => {
    expect(() =>
      coverageFailureFindings(
        { analyzerName: 'coverage', projectRoot: '/p' },
        {
          report: { numFailedTests: 0, testResults: [] },
          result: { status: 1, stdout: '', stderr: 'Unhandled Rejection: boom' },
          runnerName: 'Vitest',
        },
      ),
    ).toThrow(
      /^Vitest exited 1 without naming a failing test\nProcess output:\nUnhandled Rejection: boom/u,
    );
  });
  it('anchors the tool error inside the project even for a test file Vitest reports elsewhere', () => {
    const [finding] = coverageFailureFindings(
      { analyzerName: 'coverage', projectRoot: '/p' },
      {
        report: {
          numFailedTests: 1,
          testResults: [
            {
              name: '/elsewhere/test/a.test.ts',
              assertionResults: [{ fullName: 'adds', status: 'failed', failureMessages: ['no'] }],
            },
          ],
        },
        result: { status: 1, stdout: '', stderr: '' },
        runnerName: 'Vitest',
      },
    );

    expect(finding).toEqual({
      tool: 'coverage',
      rule: 'tests-failed',
      path: '.',
      identity: 'tests-failed',
      message:
        '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  /elsewhere/test/a.test.ts > adds: no',
      classification: 'tool-error',
    });
    expect(finding.message).toBe(
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n  /elsewhere/test/a.test.ts > adds: no',
    );
  });
  it('says which steps of the test script nitpicker did not run before the tests', () => {
    const run = (precedingCommands) =>
      coverageFailureFindings(
        { analyzerName: 'coverage', projectRoot: '/p' },
        {
          report: {
            numFailedTests: 1,
            testResults: [
              {
                name: '/p/test/a.test.js',
                status: 'failed',
                message: "Cannot find module '../dist/a.js'",
                assertionResults: [],
              },
            ],
          },
          result: { status: 1, stdout: '', stderr: '' },
          runnerName: 'node:test',
          precedingCommands,
        },
      ).map(({ message }) => message);
    const failure =
      '1 test fails, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:\n' +
      "  test/a.test.js > could not run: Cannot find module '../dist/a.js'";

    expect(run(['tsc'])).toEqual([
      `${failure}\nThe test script runs "tsc" before the tests; nitpicker runs only the test command, ` +
        'so run that step first if the tests need it.',
    ]);
    expect(run(['npm run build', 'npm run seed'])).toEqual([
      `${failure}\nThe test script runs "npm run build", "npm run seed" before the tests; ` +
        'nitpicker runs only the test command, so run those steps first if the tests need it.',
    ]);
    expect(run([])).toEqual([failure]);
  });
  it('lists at most five failing tests and a test file that could not run', () => {
    const failing = (index) => ({
      fullName: `case ${String(index)}`,
      status: 'failed',
      failureMessages: ['boom'],
    });
    const message = formatTestFailures(
      {
        numFailedTests: 7,
        testResults: [
          { name: '/p/test/a.test.ts', assertionResults: [1, 2, 3, 4, 5, 6].map(failing) },
          {
            name: '/p/test/broken.test.ts',
            status: 'failed',
            message: 'Failed to resolve import "./missing"',
            assertionResults: [],
          },
        ],
      },
      '/p',
    );

    expect(message).toBe(
      [
        '7 tests fail, so coverage, CRAP and mutation were skipped. Fix the tests and rerun:',
        '  test/a.test.ts > case 1: boom',
        '  test/a.test.ts > case 2: boom',
        '  test/a.test.ts > case 3: boom',
        '  test/a.test.ts > case 4: boom',
        '  test/a.test.ts > case 5: boom',
        '  … and 2 more',
      ].join('\n'),
    );
  });
  it('enforces 95% branch coverage and reports coverage per test', () => {
    const findings = normalizeCoverage(
      {
        '/project/src/main/value.ts': {
          branchSourceHashes: { 0: 'branch-source' },
          b: { 0: [1, 0] },
        },
      },
      'coverage',
      { projectRoot: '/project', testCount: 2 },
    );

    expect(findings).toEqual([
      {
        tool: 'coverage',
        rule: 'coverage',
        path: 'src/main/value.ts',
        identity: 'branches',
        message: 'Branch coverage for src/main/value.ts',
        classification: 'descriptive',
        metric: { name: 'branches', value: 50 },
      },
      {
        tool: 'coverage',
        rule: 'changed-branch-coverage',
        path: 'src/main/value.ts',
        identity: 'branch-source:branch-source:occurrence:1',
        message:
          'Branch coverage is 50.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
      },
      {
        tool: 'coverage',
        rule: 'test-efficiency',
        path: '.',
        identity: 'covered-branches-per-test',
        message: 'Covered branch outcomes per test',
        classification: 'descriptive',
        metric: { name: 'coveredBranchesPerTest', value: expect.closeTo(0.5, 10) },
      },
      {
        tool: 'coverage',
        rule: 'test-efficiency',
        path: '.',
        identity: 'test-count',
        message: 'Executed test count',
        classification: 'descriptive',
        metric: { name: 'testCount', value: 2 },
      },
    ]);
    expect(findings.map(({ metric }) => metric).filter(Boolean)).toEqual([
      { name: 'branches', value: 50 },
      { name: 'coveredBranchesPerTest', value: expect.closeTo(0.5, 10) },
      { name: 'testCount', value: 2 },
    ]);
  });
  it('names the branch arms no test took', () => {
    const findings = normalizeCoverage(
      {
        '/project/src/main/value.ts': {
          branchSourceHashes: { 0: 'branch-source' },
          uncoveredArms: { 0: ['the false arm of the ?: at 3:29'] },
          b: { 0: [1, 0] },
        },
      },
      'coverage',
      { projectRoot: '/project' },
    );

    expect(findings).toEqual([
      {
        tool: 'coverage',
        rule: 'coverage',
        path: 'src/main/value.ts',
        identity: 'branches',
        message: 'Branch coverage for src/main/value.ts',
        classification: 'descriptive',
        metric: { name: 'branches', value: 50 },
      },
      {
        tool: 'coverage',
        rule: 'changed-branch-coverage',
        path: 'src/main/value.ts',
        identity: 'branch-source:branch-source:occurrence:1',
        message:
          'Branch coverage is 50.00%; minimum is 95%. Not taken: the false arm of the ?: at 3:29. Test it, or remove it if it can\'t happen. To accept the file, add it to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
  });
  it('describes uncovered arms of Vitest branch maps by kind and position', () => {
    const source =
      'export function pick(a, b) {\n  const x = a ?? 5;\n  return x > 3 ? 1 : 2;\n}\n';
    const at = (line, column) => ({ start: { line, column } });
    expect(
      describeUncoveredArms(
        { type: 'binary-expr', locations: [at(2, 12), at(2, 17)] },
        [1, 0],
        source,
      ),
    ).toEqual(['the right side of ?? at 2:18']);
    expect(
      describeUncoveredArms(
        { type: 'cond-expr', locations: [at(3, 20), at(3, 24)] },
        [0, 1],
        source,
      ),
    ).toEqual(['the true arm of the ?: at 3:21']);
    expect(
      describeUncoveredArms(
        { type: 'if', loc: at(4, 2), locations: [at(4, 2), { start: {} }] },
        [1, 0],
        source,
      ),
    ).toEqual(['the false arm of the if (or its else) at 4:3']);
  });
  it('tells an untaken default case from another switch case and names the way out', () => {
    const source = [
      'switch (color) {',
      "  case 'red':",
      '    return 1;',
      '  default: {',
      '    const never: never = color;',
      '    return never;',
      '  }',
      '}',
    ].join('\n');
    const at = (line, column) => ({ start: { line, column } });
    const loc = { start: { line: 1, column: 0 }, end: { line: 8, column: 1 } };

    expect(
      describeUncoveredArms(
        { type: 'switch', loc, locations: [at(2, 2), at(4, 2)] },
        [0, 0],
        source,
      ),
    ).toEqual([
      'a switch case at 2:3',
      'the default case at 4:3 (a switch that lists every member of a union needs no default: switch-exhaustiveness-check proves it complete)',
    ]);
  });
  it('tells to test a default case that is not the never check of a union', () => {
    const source = [
      'switch (code) {',
      '  case 1:',
      '    return 1;',
      '  default:',
      '    never(code);',
      '    return 0;',
      '}',
    ].join('\n');
    const location = { start: { line: 4, column: 2 }, end: { line: 6, column: 13 } };

    expect(describeUncoveredArms({ type: 'switch', locations: [location] }, [0], source)).toEqual([
      'the default case at 4:3 (pass a value that no case lists)',
    ]);
  });
  it('accepts exactly 95% branch coverage', () => {
    const findings = normalizeCoverage(
      {
        '/project/src/main/value.ts': {
          branchSourceHashes: { 0: 'branch-source' },
          b: { 0: [...Array(19).fill(1), 0] },
        },
      },
      'coverage',
      { projectRoot: '/project' },
    );

    expect(findings).not.toContainEqual(
      expect.objectContaining({ rule: 'changed-branch-coverage' }),
    );
  });
  it('reactivates only the below-threshold branch whose source changes', () => {
    function coverageFindingsFor(secondBranchSourceHash) {
      return normalizeCoverage(
        {
          '/project/src/main/value.ts': {
            branchSourceHashes: {
              0: 'unchanged-branch',
              1: secondBranchSourceHash,
            },
            b: {
              0: [1, 0],
              1: [1, 0],
            },
          },
        },
        'coverage',
        { projectRoot: '/project' },
      );
    }
    const base = coverageFindingsFor('changed-branch-before');

    expect(
      compareFindings({
        baseFindings: base,
        headFindings: coverageFindingsFor('changed-branch-before'),
      }).newFindings,
    ).toEqual([]);
    const comparison = compareFindings({
      baseFindings: base,
      headFindings: coverageFindingsFor('changed-branch-after'),
    });
    expect(comparison.newFindings).toEqual([
      {
        tool: 'coverage',
        rule: 'changed-branch-coverage',
        path: 'src/main/value.ts',
        identity: 'branch-source:changed-branch-after:occurrence:1',
        message:
          'Branch coverage is 50.00%; minimum is 95%. To accept the file, add it to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
      },
    ]);
    expect(
      comparison.newFindings.filter(({ rule }) => rule === 'changed-branch-coverage'),
    ).toHaveLength(1);
  });
});
