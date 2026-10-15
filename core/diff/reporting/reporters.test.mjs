import {
  expectedOutput213_17,
  expectedOutput214_17,
  expectedOutput246_71,
  expectedOutput279_21,
  expectedOutput282_21,
  expectedOutput283_21,
  expectedOutput285_21,
  expectedOutput291_21,
} from '../fixtures/expected-output/core-diff-reporters.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { absoluteTextReportPath, writeDiffReports } from './reporters.mjs';
import { renderConsoleSummary } from './summary.mjs';
import { renderJunitReport } from './junit.mjs';
import { renderSarifReport } from './sarif.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function finding(overrides = {}) {
  return {
    tool: 'eslint',
    rule: 'no-console',
    path: 'src/a.js',
    identity: 'a:1',
    message: 'Unexpected console statement',
    classification: 'enforceable',
    location: { line: 12, column: 3 },
    ...overrides,
  };
}

function report({ newFindings = [], toolErrors = [], unchangedFindings = [] } = {}) {
  return {
    summary: {
      requestedBaseRef: 'main',
      mergeBaseSha: 'abc',
      headSha: 'def',
      overallStatus: toolErrors.length === 0 ? 'completed' : 'tool-error',
      newEnforceableFindings: newFindings.length,
      elapsedMs: 1500,
      tools: [
        { name: 'eslint', base: 0, head: 1, new: 1, resolved: 0, unchanged: 0, elapsedMs: 40 },
      ],
    },
    newFindings,
    resolvedFindings: [],
    unchangedFindings,
    changedMetrics: [],
    toolErrors,
  };
}

const SARIF_LEVELS = new Set(['none', 'note', 'warning', 'error']);

/** Checks the properties SARIF 2.1.0 requires (OASIS spec, sections 3.13 to 3.27) for what we emit. */
function expectValidSarif(log) {
  expect(log.version).toBe('2.1.0');
  expect(typeof log.$schema).toBe('string');
  expect(Array.isArray(log.runs)).toBe(true);
  expect(log.runs.length).toBeGreaterThan(0);
  for (const run of log.runs) {
    expect(typeof run.tool.driver.name).toBe('string');
    const ruleIds = new Set((run.tool.driver.rules ?? []).map((rule) => rule.id));
    expect(ruleIds.size).toBe((run.tool.driver.rules ?? []).length);
    for (const invocation of run.invocations ?? []) {
      expect(typeof invocation.executionSuccessful).toBe('boolean');
      for (const notification of invocation.toolExecutionNotifications ?? []) {
        expect(typeof notification.message.text).toBe('string');
        expect(SARIF_LEVELS.has(notification.level)).toBe(true);
      }
    }
    expect(Array.isArray(run.results)).toBe(true);
    for (const result of run.results) {
      expect(typeof result.message.text).toBe('string');
      expect(result.message.text.length).toBeGreaterThan(0);
      expect(SARIF_LEVELS.has(result.level)).toBe(true);
      expect(ruleIds.has(result.ruleId)).toBe(true);
      for (const location of result.locations) {
        expect(typeof location.physicalLocation.artifactLocation.uri).toBe('string');
        const region = location.physicalLocation.region;
        if (region !== undefined) {
          expect(Number.isInteger(region.startLine) && region.startLine >= 1).toBe(true);
          if (region.startColumn !== undefined) {
            expect(Number.isInteger(region.startColumn) && region.startColumn >= 1).toBe(true);
          }
        }
      }
      for (const value of Object.values(result.partialFingerprints)) {
        expect(typeof value).toBe('string');
      }
    }
  }
}

/**
 * Minimal XML well-formedness check (no dependency): one root element, balanced tags, quoted
 * attributes, only the five predefined entities, and no characters XML 1.0 forbids.
 */
function expectWellFormedXml(xml) {
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  // eslint-disable-next-line no-control-regex -- the point is to reject these characters
  expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/u);
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/u, '');
  const stack = [];
  let roots = 0;
  const token =
    /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos);[^"<&]*)*")*)\s*(\/?)>|([^<]+)|(<)/gu;
  for (const match of body.matchAll(token)) {
    const [, closing, name, , selfClosing, text, malformed] = match;
    expect(malformed, `malformed tag at offset ${String(match.index)}`).toBeUndefined();
    if (name === undefined) {
      expect(text.replaceAll(/&(?:amp|lt|gt|quot|apos);/gu, '')).not.toMatch(/[&>]/u);
      if (stack.length === 0) {
        expect(text.trim()).toBe('');
      }
    } else if (closing === '/') {
      expect(stack.pop()).toBe(name);
    } else {
      if (stack.length === 0) {
        roots += 1;
      }
      if (selfClosing === '') {
        stack.push(name);
      }
    }
  }
  expect(stack).toEqual([]);
  expect(roots).toBe(1);
}

function attributeOf(xml, name) {
  return new RegExp(`${name}="([^"]*)"`, 'u').exec(xml)?.[1];
}

describe('renderSarifReport', () => {
  it('emits a structurally valid SARIF 2.1.0 log with fingerprints', () => {
    const log = JSON.parse(
      renderSarifReport(
        report({
          newFindings: [
            finding(),
            finding({ rule: 'no-var', identity: 'b:2', location: undefined }),
            finding({
              tool: 'complexity',
              rule: 'cyclomatic',
              identity: 'fn',
              classification: 'descriptive',
              metric: { name: 'cyclomatic', value: 9 },
            }),
          ],
          toolErrors: [{ tool: 'depcruise', snapshot: 'head', message: 'boom' }],
        }),
      ),
    );

    expectValidSarif(log);
    const [run] = log.runs;
    expect(run.results.map((result) => [result.ruleId, result.level])).toEqual([
      ['eslint/no-console', 'error'],
      ['eslint/no-var', 'error'],
      ['complexity/cyclomatic', 'note'],
    ]);
    expect(run.results[0].locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: 'src/a.js' },
      region: { startLine: 12, startColumn: 3 },
    });
    expect(run.results[1].locations[0].physicalLocation.region).toBeUndefined();
    expect(run.invocations[0]).toEqual({
      executionSuccessful: false,
      toolExecutionNotifications: [{ level: 'error', message: { text: 'depcruise (head): boom' } }],
    });
  });
  it('keeps fingerprints stable across line moves and distinct across findings', () => {
    const fingerprint = (value) =>
      JSON.parse(renderSarifReport(report({ newFindings: [value] }))).runs[0].results[0]
        .partialFingerprints['nitpickerIdentity/v1'];

    const original = fingerprint(finding());
    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(finding({ location: { line: 99 }, message: 'reworded' }))).toBe(original);
    expect(fingerprint(finding({ identity: 'other' }))).not.toBe(original);
    expect(fingerprint(finding({ path: 'src/b.js' }))).not.toBe(original);
  });
  it('emits an empty result list for a clean report', () => {
    const log = JSON.parse(renderSarifReport(report()));
    expectValidSarif(log);
    expect(log.runs[0].results).toEqual([]);
    expect(log.runs[0].invocations[0].executionSuccessful).toBe(true);
  });
});
describe('renderJunitReport', () => {
  it('produces well-formed XML with a failure per new enforceable finding and tool error', () => {
    const xml = renderJunitReport(
      report({
        newFindings: [
          finding({ message: 'Use <logger> & "quotes"\nsecond line' }),
          finding({ rule: 'size', classification: 'descriptive', identity: 'd' }),
        ],
        toolErrors: [{ tool: 'depcruise', snapshot: 'head', message: "it's \u0001 broken" }],
      }),
    );

    expectWellFormedXml(xml);
    const suite = /<testsuite [^>]*>/u.exec(xml)[0];
    expect(attributeOf(suite, 'tests')).toBe('3');
    expect(attributeOf(suite, 'failures')).toBe('2');
    expect(xml).toEqual(expectedOutput213_17());
    expect(xml).toEqual(expectedOutput214_17());
    expect(xml).not.toContain('eslint/size');
  });
  it('produces well-formed XML for a clean report', () => {
    const xml = renderJunitReport(report());
    expectWellFormedXml(xml);
    expect(attributeOf(/<testsuite [^>]*>/u.exec(xml)[0], 'failures')).toBe('0');
  });
  it('rejects malformed XML in the checker itself', () => {
    expect(() => {
      expectWellFormedXml('<?xml version="1.0" encoding="UTF-8"?>\n<a><b></a>');
    }).toThrow();
    expect(() => {
      expectWellFormedXml('<?xml version="1.0" encoding="UTF-8"?>\n<a x=1></a>');
    }).toThrow();
  });
});
describe('writeDiffReports', () => {
  it('writes JSON, text, JUnit and SARIF files to the reports directory', () => {
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-reports-'));
    temporaryRoots.push(outputRoot);

    writeDiffReports(outputRoot, report({ newFindings: [finding()] }));

    expectValidSarif(JSON.parse(readFileSync(path.join(outputRoot, 'report.sarif'), 'utf8')));
    expectWellFormedXml(readFileSync(path.join(outputRoot, 'report.junit.xml'), 'utf8'));
    expect(
      JSON.parse(readFileSync(path.join(outputRoot, 'new-findings.json'), 'utf8')),
    ).toHaveLength(1);
    expect(readFileSync(path.join(outputRoot, 'report.txt'), 'utf8')).toEqual(
      expectedOutput246_71(),
    );
  });
});
describe('absoluteTextReportPath', () => {
  it('returns the report file inside an absolute output root', () => {
    expect(absoluteTextReportPath(path.join(path.sep, 'work', 'out'))).toBe(
      path.join(path.sep, 'work', 'out', 'report.txt'),
    );
  });
  it('resolves a relative output root so the printed path works from any directory', () => {
    const resolved = absoluteTextReportPath(path.join('..', 'control', 'reports'));

    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved).toBe(path.resolve('..', 'control', 'reports', 'report.txt'));
  });
});
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

    expect(summary).toEqual(expectedOutput279_21());
    expect(summary).toEqual(expectedOutput282_21());
    expect(summary).toEqual(expectedOutput283_21());
    expect(summary).not.toContain('✓');
    expect(summary).toEqual(expectedOutput285_21());
  });
  it('keeps the green line when there are no violations and no tool errors', () => {
    const summary = renderConsoleSummary({ newFindings: [], toolErrors: [] }, { color: false });

    expect(summary).toEqual(expectedOutput291_21());
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
