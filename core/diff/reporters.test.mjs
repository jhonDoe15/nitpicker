import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  absoluteTextReportPath,
  renderConsoleSummary,
  renderJunitReport,
  renderSarifReport,
  renderTextReport,
  writeDiffReports,
} from './reporters.mjs';

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
  let cursor = 0;
  const tag =
    /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+="[^"<&]*(?:&(?:amp|lt|gt|quot|apos);[^"<&]*)*")*)\s*(\/?)>/uy;
  while (cursor < body.length) {
    if (body[cursor] === '<') {
      tag.lastIndex = cursor;
      const match = tag.exec(body);
      expect(match, `malformed tag at offset ${String(cursor)}`).not.toBeNull();
      const [whole, closing, name, , selfClosing] = match;
      if (closing === '/') {
        expect(stack.pop()).toBe(name);
      } else {
        if (stack.length === 0) {
          roots += 1;
        }
        if (selfClosing === '') {
          stack.push(name);
        }
      }
      cursor += whole.length;
    } else {
      const next = body.indexOf('<', cursor);
      const text = body.slice(cursor, next === -1 ? body.length : next);
      expect(text.replaceAll(/&(?:amp|lt|gt|quot|apos);/gu, '')).not.toMatch(/[&>]/u);
      if (stack.length === 0) {
        expect(text.trim()).toBe('');
      }
      cursor += text.length;
    }
  }
  expect(stack).toEqual([]);
  expect(roots).toBe(1);
}

function attributeOf(xml, name) {
  return new RegExp(`${name}="([^"]*)"`, 'u').exec(xml)?.[1];
}

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
    expect(xml).toContain('name="eslint/no-console src/a.js:12"');
    expect(xml).toContain('Use &lt;logger&gt; &amp; &quot;quotes&quot;');
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
    expect(readFileSync(path.join(outputRoot, 'report.txt'), 'utf8')).toContain('New findings: 1');
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

    expect(summary).toContain(
      "mutation (head): error TS2688: Cannot find type definition file for 'node'.",
    );
    expect(summary).toContain('mutation (base): error TS2688');
    expect(summary).toContain('(full text in the diagnostics file)');
    expect(summary).not.toContain('✓');
    expect(summary).toContain('No new enforceable violations, but the run is incomplete:');
  });

  it('keeps the green line when there are no violations and no tool errors', () => {
    const summary = renderConsoleSummary({ newFindings: [], toolErrors: [] }, { color: false });

    expect(summary).toContain('✓ No new enforceable violations');
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

describe('touched, still over limit', () => {
  const held = finding({
    tool: 'structure',
    rule: 'function-lines-limit',
    message: 'computeInvoice has 68 lines; limit is 50',
    location: { line: 3 },
    heldAtBase: 68,
    ratchet: {
      key: 'k',
      value: 68,
      worseMessage: 'grew from {base}',
      heldMessage:
        'computeInvoice: 68 lines (limit 50), allowed because base was {base}; any increase fails.',
    },
  });
  const untouched = finding({ rule: 'no-console', identity: 'unchanged:1' });
  const heldLint = finding({
    rule: '@typescript-eslint/no-explicit-any',
    message: 'Unexpected any.',
    heldAtBase: 2,
    ratchet: { key: 'count:any', value: 2, existingCodeOnly: true },
  });

  it('lists a held finding as a note in the text report', () => {
    const text = renderTextReport(report({ unchangedFindings: [held, untouched] }));

    expect(text).toBe(
      [
        'Nitpicker quality diff',
        'Base ref: main',
        'Merge base: abc',
        'Head: def',
        'Status: completed',
        'New enforceable findings: 0',
        'New findings: 0',
        'Resolved findings: 0',
        'Unchanged findings: 0',
        'Changed metrics: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'eslint: base=0 head=1 new=1 resolved=0 unchanged=0 changed-metrics=undefined elapsed=0.040s',
        '',
        'Touched, still over limit (not failing):',
        'structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        '',
      ].join('\n'),
    );
  });

  it('lists a held finding as a note in the console summary without failing', () => {
    const summary = renderConsoleSummary(report({ unchangedFindings: [held] }), { color: false });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 touched function still over a limit (not failing, not worse than before):',
        '  structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });

  it('words a held lint finding by what it is, not as a function over a limit', () => {
    const text = renderTextReport(report({ unchangedFindings: [held, heldLint] }));
    const summary = renderConsoleSummary(report({ unchangedFindings: [held, heldLint] }), {
      color: false,
    });

    expect(text).toBe(
      [
        'Nitpicker quality diff',
        'Base ref: main',
        'Merge base: abc',
        'Head: def',
        'Status: completed',
        'New enforceable findings: 0',
        'New findings: 0',
        'Resolved findings: 0',
        'Unchanged findings: 0',
        'Changed metrics: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'eslint: base=0 head=1 new=1 resolved=0 unchanged=0 changed-metrics=undefined elapsed=0.040s',
        '',
        'Touched, still over limit (not failing):',
        'structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        '',
        'Existing lint findings in edited code (not failing):',
        'eslint/@typescript-eslint/no-explicit-any src/a.js:12 Unexpected any. (2 at base and now; any increase fails)',
        '',
      ].join('\n'),
    );
    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 touched function still over a limit (not failing, not worse than before):',
        '  structure/function-lines-limit src/a.js:3 computeInvoice: 68 lines (limit 50), allowed because base was 68; any increase fails.',
        'Note: 1 existing lint finding in edited code (not failing, no more than before):',
        '  eslint/@typescript-eslint/no-explicit-any src/a.js:12 Unexpected any. (2 at base and now; any increase fails)',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });

  it('words a held function metric without contradicting its limit', () => {
    const heldCrap = finding({
      tool: 'crap',
      rule: 'crap-score-limit',
      message:
        'summarizeShipping has CRAP 10.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
      location: { line: 22 },
      heldAtBase: 16.02,
      ratchet: {
        key: 'k',
        value: 10,
        worseMessage: 'rose',
        heldMessage:
          'summarizeShipping: CRAP 10.00 (limit 9), allowed because base was {base}; any increase fails.',
      },
    });

    const summary = renderConsoleSummary(report({ unchangedFindings: [heldCrap] }), {
      color: false,
    });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 touched function still over a limit (not failing, not worse than before):',
        '  crap/crap-score-limit src/a.js:22 summarizeShipping: CRAP 10.00 (limit 9), allowed because base was 16.02; any increase fails.',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });

  it('falls back to the finding message for a held metric without a held message', () => {
    const unmessaged = finding({
      rule: 'complexity',
      message: 'Function has a complexity of 12.',
      heldAtBase: 12,
      ratchet: { key: 'k', value: 12, worseMessage: 'grew from {base}' },
    });

    const summary = renderConsoleSummary(report({ unchangedFindings: [unmessaged] }), {
      color: false,
    });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 touched function still over a limit (not failing, not worse than before):',
        '  eslint/complexity src/a.js:12 Function has a complexity of 12. (allowed because base was 12; any increase fails)',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });

  it('says how many of a held lint finding there are now when fewer than at base', () => {
    const fewer = finding({
      rule: '@typescript-eslint/no-explicit-any',
      message: 'Unexpected any.',
      heldAtBase: 5,
      ratchet: { key: 'count:any', value: 3, existingCodeOnly: true },
    });

    const summary = renderConsoleSummary(report({ unchangedFindings: [fewer] }), {
      color: false,
    });

    expect(summary).toBe(
      [
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        'Note: 1 existing lint finding in edited code (not failing, no more than before):',
        '  eslint/@typescript-eslint/no-explicit-any src/a.js:12 Unexpected any. (5 at base, 3 now; any increase fails)',
        'Full diagnostics: reports/quality/diff/combined/report.txt',
        '',
      ].join('\n'),
    );
  });

  it('adds nothing when no finding was held', () => {
    const text = renderTextReport(report({ unchangedFindings: [untouched] }));
    const summary = renderConsoleSummary(report({ unchangedFindings: [untouched] }), {
      color: false,
    });

    expect(text).not.toContain('still over limit');
    expect(summary).not.toContain('Note:');
  });
});

describe('renderTextReport', () => {
  it('marks an analyzer that was skipped instead of showing it as clean', () => {
    const tool = (name, extra = {}) => ({
      name,
      base: 0,
      head: 0,
      new: 0,
      resolved: 0,
      unchanged: 0,
      changedMetrics: 0,
      elapsedMs: 0,
      ...extra,
    });
    const text = renderTextReport({
      summary: {
        requestedBaseRef: 'main',
        mergeBaseSha: 'a',
        headSha: 'b',
        overallStatus: 'tool-error',
        newEnforceableFindings: 0,
        tools: [tool('coverage'), tool('crap', { skippedBecause: 'coverage' })],
      },
      newFindings: [],
      resolvedFindings: [],
      changedMetrics: [],
      unchangedFindings: [],
      toolErrors: [],
    });

    expect(text).toMatch(/^crap: .* skipped \(coverage failed\)$/mu);
    expect(text).not.toMatch(/^coverage: .*skipped/mu);
  });
});
