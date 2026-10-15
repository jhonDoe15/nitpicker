import {
  expectedOutput588_22,
  expectedOutput620_22,
  expectedOutput648_22,
  expectedOutput674_22,
  expectedOutput757_36,
  expectedOutput802_22,
  expectedOutput809_22,
  expectedOutput812_22,
  expectedOutput931_79,
  expectedOutput937_84,
  expectedOutput945_7,
  expectedOutput1011_7,
} from '../../fixtures/expected-output/core-diff-quality-areas-diff-policy.mjs';
import { describe, expect, it } from 'vitest';
import {
  applyThresholds,
  configuredAnalyzers,
} from '../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { hashFiles } from '../../../../languages/typescript/preset/checks/hash.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../shared/policy.mjs';
import { compareFindings } from '../../comparison/compare.mjs';
import {
  describeUncoveredArms,
  sourceSnippet,
} from '../../../../languages/typescript/adapters/quality-areas/reporting/source-hashes.mjs';
import { normalizeDeadCode } from '../../../../languages/typescript/adapters/quality-areas/reporting/repository.mjs';
import {
  normalizeCoverage,
  normalizeCrap,
  normalizeMutation,
} from '../../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';
import { normalizeDuplicates } from '../../../../languages/typescript/preset/duplicates/normalize.mjs';

describe('complete quality-area analyzer catalog', () => {
  it('keys unused exports by their declaration, not by the whole file', () => {
    const report = (sourceHash) => ({
      issues: [{ file: 'src/a.ts', exports: [{ name: 'unused', line: 3, col: 1, sourceHash }] }],
    });
    const [before] = normalizeDeadCode(report('declaration'), 'dead-code');
    const [after] = normalizeDeadCode(report('declaration'), 'dead-code');
    const [edited] = normalizeDeadCode(report('edited-declaration'), 'dead-code');

    expect(after.identity).toBe(before.identity);
    expect(edited.identity).not.toBe(before.identity);
  });
  it('reports a helper copied between test files but not repeated expected data', () => {
    const clone = (fragment) => ({
      firstFile: { name: 'test/a.test.ts', start: 2 },
      secondFile: { name: 'test/b.test.ts', start: 7 },
      fragment,
      lines: 12,
      tokens: 80,
    });
    const isTestFile = (file) => file.startsWith('test/');
    const failures = (fragments) =>
      normalizeDuplicates(
        { duplicates: fragments.map((fragment) => clone(fragment)) },
        'duplicates',
        { configuredPaths: [], isTestFile },
      ).filter(({ rule }) => rule === 'duplicate-clone');
    const helpers = [
      'function capture() {\n  const writes = [];\n  return writes;\n}',
      'const lines = (text: string) => text.split("\\n");',
    ];
    const data = [
      "expect(total).toEqual({\n  lines: ['Subtotal: $20.00'],\n  totalCents: 2759,\n});",
      "it('totals the order', () => {\n  expect(total()).toBe(3);\n});",
    ];

    expect(failures([...helpers, ...data])).toEqual(failures(helpers));
    expect(failures(helpers)).toHaveLength(2);
  });
  it('normalizes duplicate clone size as descriptive metrics', () => {
    const findings = normalizeDuplicates(
      {
        duplicates: [
          {
            firstFile: { name: 'a.ts', start: 2 },
            secondFile: { name: 'b.ts', start: 7 },
            lines: 10,
            tokens: 30,
          },
        ],
      },
      'duplicates',
      { configuredPaths: ['src/main'] },
    );

    expect(findings).toEqual(expectedOutput588_22());
  });
  it('keeps canonical duplicate paths and locations aligned', () => {
    const findings = normalizeDuplicates(
      {
        duplicates: [
          {
            firstFile: { name: 'src/main/z.ts', start: 2 },
            secondFile: { name: 'src/main/a.ts', start: 7 },
            lines: 10,
            tokens: 30,
          },
        ],
      },
      'duplicates',
      { configuredPaths: ['src/main'] },
    );

    expect(findings).toEqual(expectedOutput620_22());
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

    expect(findings).toEqual(expectedOutput648_22());
    expect(findings.map(({ metric }) => metric).filter(Boolean)).toEqual([
      { name: 'branches', value: 50 },
      { name: 'coveredBranchesPerTest', value: 0.5 },
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

    expect(findings).toEqual(expectedOutput674_22());
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
    expect(comparison.newFindings).toEqual(expectedOutput757_36());
    expect(
      comparison.newFindings.filter(({ rule }) => rule === 'changed-branch-coverage'),
    ).toHaveLength(1);
  });
  it('reports surviving mutants and status totals without gating on score', () => {
    const findings = normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Killed',
                mutatorName: 'ArithmeticOperator',
                replacement: '-',
                location: { start: { line: 2, column: 3 } },
              },
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line: 4, column: 5 } },
              },
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line: 4, column: 5 } },
              },
            ],
          },
        },
      },
      'mutation',
    );

    expect(findings).toEqual(expectedOutput802_22());
    expect(findings).toEqual(expectedOutput809_22());
    expect(findings).toEqual(expectedOutput812_22());
    const survivingMutants = findings.filter(({ rule }) => rule === 'mutant-survived');
    expect(new Set(survivingMutants.map(({ identity }) => identity)).size).toBe(2);
  });
  it('carries the mutant column and original code into the message and location', () => {
    const [finding] = normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Survived',
                mutatorName: 'ConditionalExpression',
                replacement: 'true',
                original: 'a > b',
                location: { start: { line: 4, column: 15 } },
              },
            ],
          },
        },
      },
      'mutation',
    ).filter(({ rule }) => rule === 'mutant-survived');

    expect(finding.location).toEqual({ line: 4, column: 15 });
    expect(finding.message).toBe(
      'Survived ConditionalExpression at column 15: replacing `a > b` with `true` fails no test. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
    );
  });
  it('cuts the mutated code out of the source by 1-based Stryker positions', () => {
    const source = 'const a = 1;\nreturn a > 2 && a < 9;\n';
    const at = (line, column) => ({ line, column });

    expect(sourceSnippet(source, { start: at(2, 8), end: at(2, 13) })).toBe('a > 2');
    expect(sourceSnippet(source, { start: at(1, 11), end: at(2, 7) })).toBe('1;\nreturn');
    expect(sourceSnippet(source, { start: at(9, 1), end: at(9, 2) })).toBeUndefined();
  });
  it('keeps mutant identities stable when source positions move', () => {
    function reportAt(line) {
      return {
        files: {
          'src/main/value.ts': {
            mutants: [
              {
                status: 'Survived',
                mutatorName: 'BooleanLiteral',
                replacement: 'false',
                location: { start: { line, column: 5 } },
              },
            ],
          },
        },
      };
    }

    const before = normalizeMutation(reportAt(4), 'mutation');
    const after = normalizeMutation(reportAt(40), 'mutation');

    expect(before.find(({ rule }) => rule === 'mutant-survived')?.identity).toBe(
      after.find(({ rule }) => rule === 'mutant-survived')?.identity,
    );
  });
  it('assigns repeated CRAP symbols by source order instead of report rank', () => {
    function functionEntry(line, crap) {
      return {
        source: 'src/main/value.ts',
        function: 'constructor',
        lines: { start: line, end: line + 2 },
        complexity: 1,
        statementCoverage: { percent: 100 },
        branchCoverage: { percent: 100 },
        effectiveCoverage: { percent: 100 },
        crap,
      };
    }

    const first = normalizeCrap(
      { functions: [functionEntry(40, 10), functionEntry(10, 1)] },
      'crap',
    );
    const second = normalizeCrap(
      { functions: [functionEntry(10, 20), functionEntry(40, 2)] },
      'crap',
    );
    function identityAt(findings, line) {
      return findings.find(
        ({ rule, metric, location }) =>
          rule === 'function-crap' && metric.name === 'complexity' && location.line === line,
      )?.identity;
    }

    expect(identityAt(first, 10)).toBe(identityAt(second, 10));
    expect(identityAt(first, 40)).toBe(identityAt(second, 40));
  });
  it('enforces CRAP scores at 9 or higher and unknown coverage', () => {
    function functionEntry(crap, sourceHash) {
      return {
        source: 'src/main/value.ts',
        function: 'value',
        sourceHash,
        lines: { start: 1, end: 3 },
        complexity: 1,
        statementCoverage: { percent: crap === null ? null : 100 },
        branchCoverage: { percent: crap === null ? null : 100 },
        effectiveCoverage: { percent: crap === null ? null : 100 },
        crap,
      };
    }

    expect(normalizeCrap({ functions: [functionEntry(8.99, 'safe')] }, 'crap')).not.toContainEqual(
      expect.objectContaining({ classification: 'enforceable' }),
    );
    expect(normalizeCrap({ functions: [functionEntry(9, 'limit')] }, 'crap')).toEqual(
      expectedOutput931_79(),
    );
    expect(normalizeCrap({ functions: [functionEntry(null, 'unknown')] }, 'crap')).toEqual(
      expectedOutput937_84(),
    );
    expect(normalizeCrap({ functions: [functionEntry(undefined, 'missing')] }, 'crap')).toEqual(
      expectedOutput945_7(),
    );
  });
  it('uses 9 by default and takes an explicit CRAP limit from the config thresholds', () => {
    expect(DEFAULT_CRAP_SCORE_LIMIT).toBe(9);
    const [configured] = applyThresholds(
      configuredAnalyzers.filter(({ name }) => name === 'crap'),
      { crapLimit: 12 },
    );
    const invocation = configured.createInvocation({
      projectRoot: '/project',
      policyRoot: '/policy',
      toolRoot: '/tools',
      snapshot: 'head',
    });
    expect(invocation.args.slice(-2)).toEqual(['--crap-score-limit', '12']);
    const defaultCrap = configuredAnalyzers.find(({ name }) => name === 'crap');
    expect(configured.configurationHash).not.toBe(defaultCrap.configurationHash);
    expect(typeof configured.resolveVersion).toBe('function');
  });
  it('includes the active CRAP limit in the configuration hash', () => {
    expect(
      hashFiles(
        ['languages/typescript/preset/defaults/crap.config.mjs'],
        ['--crap-score-limit', '9'],
      ),
    ).not.toBe(
      hashFiles(
        ['languages/typescript/preset/defaults/crap.config.mjs'],
        ['--crap-score-limit', '12'],
      ),
    );
  });
  it('allows CRAP scores to vary below an explicit limit', () => {
    function functionEntry(crap) {
      return {
        source: 'src/main/value.ts',
        function: 'value',
        sourceHash: 'changed',
        lines: { start: 1, end: 3 },
        complexity: 2,
        statementCoverage: { percent: 100 },
        branchCoverage: { percent: 100 },
        effectiveCoverage: { percent: 100 },
        crap,
      };
    }

    const baseFindings = normalizeCrap({ functions: [functionEntry(10)] }, 'crap', {
      scoreLimit: 12,
    });
    const headFindings = normalizeCrap({ functions: [functionEntry(11.99)] }, 'crap', {
      scoreLimit: 12,
    });
    expect(compareFindings({ baseFindings, headFindings }).newFindings).toEqual([]);
    expect(
      normalizeCrap({ functions: [functionEntry(12)] }, 'crap', {
        scoreLimit: 12,
      }),
    ).toEqual(expectedOutput1011_7());
  });
});
