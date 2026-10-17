import { describe, expect, it } from 'vitest';
import { normalizeArchitectureViolations } from '../../../languages/typescript/adapters/static-checks-runner.mjs';
import {
  normalizeCoupling,
  normalizeStructure,
  normalizeTestRuntime,
} from '../../../languages/typescript/adapters/quality-areas/reporting/repository.mjs';
import { normalizeDeadCode } from '../../../languages/typescript/adapters/quality-areas/reporting/dead-code.mjs';
import {
  normalizeCrap,
  normalizeMutation,
} from '../../../languages/typescript/adapters/quality-areas/reporting/tests.mjs';
import { normalizeDuplicates } from '../../../languages/typescript/preset/duplicates/normalize.mjs';
import { toEntryPointDiffFindings } from '../../../languages/typescript/adapters/entry-points.mjs';
import { parseAnalyzerReport, parseFinding } from './finding-schema.mjs';
import { validate } from './test-support/schema-validator.mjs';

function sampleFindings() {
  const crapEntry = (crap) => ({
    source: 'src/main/value.ts',
    function: 'value',
    sourceHash: 'h',
    lines: { start: 1, end: 3 },
    complexity: 1,
    statementCoverage: { percent: 100 },
    branchCoverage: { percent: 100 },
    effectiveCoverage: { percent: 100 },
    crap,
  });
  return [
    ...normalizeCoupling(
      {
        summary: { modules: 2 },
        modules: [{ source: 'src/main/a.ts', fanIn: 1, fanOut: 2 }],
        stabilityDirection: [{ source: 'stable', target: 'volatile', delta: 0.5 }],
      },
      'coupling',
    ),
    ...normalizeTestRuntime(
      {
        summary: { discoveredTests: 1, categories: { 'no-production-runtime': 1 } },
        findings: [{ category: 'no-production-runtime', test: 'tests/orphan.test.ts' }],
      },
      'test-runtime',
    ),
    ...normalizeStructure(
      {
        functions: [
          {
            source: 'src/main/value.ts',
            function: 'value',
            sourceHash: 'f',
            start: 1,
            end: 51,
            lines: 51,
            statements: 16,
            maxControlNesting: 3,
            parameters: 4,
          },
        ],
      },
      'structure',
    ),
    ...normalizeDuplicates(
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
    ),
    ...normalizeDeadCode(
      {
        files: ['src/main/unused.ts'],
        issues: [{ file: 'src/main/unused.ts', exports: [{ name: 'x', line: 4, col: 14 }] }],
      },
      'dead-code',
    ),
    ...normalizeCrap({ functions: [crapEntry(10), crapEntry(null)] }, 'crap'),
    ...normalizeMutation(
      {
        files: {
          'src/main/value.ts': {
            mutants: [
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
    ),
    ...normalizeArchitectureViolations(
      {
        summary: {
          violations: [
            {
              type: 'cycle',
              from: 'src/main/a.ts',
              to: 'src/main/b.ts',
              rule: { name: 'no-production-cycles', severity: 'error' },
              cycle: [{ name: 'src/main/a.ts' }, { name: 'src/main/b.ts' }],
            },
            {
              from: 'src/main/a.ts',
              to: 'src/main/c.ts',
              rule: { name: 'no-orphans', severity: 'warn' },
            },
          ],
        },
      },
      'dependency-architecture',
    ),
    ...toEntryPointDiffFindings({
      publicAlternativeBypasses: [
        {
          source: 'src/main/alpha/consumer.ts',
          target: 'src/main/beta/internal.ts',
          publicEntryPoint: 'src/main/beta/index.ts',
          dependencyKind: 'runtime',
        },
      ],
    }),
  ];
}

describe('spec/findings.schema.json', () => {
  it('accepts every finding produced by the existing analyzer normalizers', () => {
    const findings = sampleFindings();

    expect(findings.length).toBeGreaterThan(20);
    expect(new Set(findings.map(({ classification }) => classification))).toEqual(
      new Set(['enforceable', 'descriptive']),
    );
    expect(validate({ findings })).toEqual([]);
  });

  it('accepts what the reference parser accepts, including tool-error findings', () => {
    const report = {
      findings: [
        ...sampleFindings(),
        {
          tool: 'eslint-lint',
          rule: 'crash',
          path: '.',
          identity: 'crash',
          message: 'analyzer crashed',
          classification: 'tool-error',
        },
      ],
    };

    expect(parseAnalyzerReport(report, 'fixture').findings).toHaveLength(report.findings.length);
    expect(validate(report)).toEqual([]);
  });

  it('rejects the same malformed findings as the reference parser', () => {
    const valid = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
    };
    const malformed = [
      { ...valid, tool: '' },
      { ...valid, rule: undefined },
      { ...valid, path: '../outside.ts' },
      { ...valid, path: '/abs/file.ts' },
      { ...valid, path: 'C:/windows/file.ts' },
      { ...valid, identity: 'bad\0id' },
      { ...valid, classification: 'blocking' },
      { ...valid, symbol: '' },
      { ...valid, location: { line: 0 } },
      { ...valid, location: { line: 1, column: 1.5 } },
      { ...valid, classification: 'descriptive', metric: { name: 'm', value: Infinity } },
      { ...valid, metric: { name: 'm', value: 1 } },
      { ...valid, toolNotRun: true },
      { ...valid, classification: 'descriptive', toolNotRun: false },
      { ...valid, classification: 'descriptive', notRunScope: ['core'] },
      { ...valid, classification: 'descriptive', toolNotRun: true, notRunScope: [] },
      { ...valid, classification: 'descriptive', toolNotRun: true, notRunScope: [''] },
      { ...valid, classification: 'descriptive', toolNotRun: true, notRunScope: 'core' },
      { ...valid, classification: 'descriptive', notRunIdentityPrefix: 'cpd:' },
      { ...valid, classification: 'descriptive', toolNotRun: true, notRunIdentityPrefix: '' },
      { ...valid, classification: 'descriptive', toolNotRun: true, notRunIdentityPrefix: 1 },
    ];

    for (const finding of malformed) {
      expect(() => parseFinding(finding)).toThrow(TypeError);
      expect(validate({ findings: [finding] }), JSON.stringify(finding)).not.toEqual([]);
    }
    expect(validate({})).not.toEqual([]);
    expect(validate({ findings: [{ ...valid, extra: true }] })).not.toEqual([]);
  });

  it('accepts optional symbol, location and metric fields', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'descriptive',
      symbol: 'fn',
      location: { line: 3, column: 2 },
      metric: { name: 'm', value: 0.5 },
    };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
  });

  it('accepts a ratchet with growth advice and rejects an empty one', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
      ratchet: { key: 'count:k', value: 2, growthAdvice: 'Had {base}.' },
    };
    const empty = { ...finding, ratchet: { ...finding.ratchet, growthAdvice: '' } };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(empty)).toThrow(TypeError);
    expect(validate({ findings: [empty] })).not.toEqual([]);
  });

  it('accepts line ranges a held finding must keep unchanged and rejects a reversed one', () => {
    const finding = {
      tool: 'duplicates',
      rule: 'duplicate-clone',
      path: 'a.java',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
      ratchet: {
        key: 'pair:a.java|b.java:clone',
        value: 60,
        mustKeepUnchangedLines: [{ path: 'a.java', startLine: 3, endLine: 9 }],
      },
    };
    const reversed = {
      ...finding,
      ratchet: {
        ...finding.ratchet,
        mustKeepUnchangedLines: [{ path: 'a.java', startLine: 9, endLine: 3 }],
      },
    };
    const unnamed = {
      ...finding,
      ratchet: { ...finding.ratchet, mustKeepUnchangedLines: [{ startLine: 3, endLine: 9 }] },
    };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(reversed)).toThrow(TypeError);
    expect(() => parseFinding(unnamed)).toThrow(TypeError);
    expect(validate({ findings: [unnamed] })).not.toEqual([]);
  });

  it('accepts a tool-not-run notice on a descriptive finding', () => {
    const finding = {
      tool: 'javac',
      rule: 'lint-not-run',
      path: '.',
      identity: 'lint-not-run',
      message: 'No javac lint report.',
      classification: 'descriptive',
      toolNotRun: true,
    };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
  });

  it('accepts a tool-not-run notice scoped to directories and an identity prefix', () => {
    const finding = {
      tool: 'duplicates',
      rule: 'cpd-not-run',
      path: '.',
      identity: 'cpd-not-run',
      message: 'No CPD duplicate report.',
      classification: 'descriptive',
      toolNotRun: true,
      notRunScope: ['core/src/main/java', 'core/src/test/java'],
      notRunIdentityPrefix: 'cpd:',
    };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(parseFinding({ ...finding, notRunScope: ['./', '.\\', 'core\\src/'] })).toEqual({
      ...finding,
      notRunScope: ['.', '.', 'core/src'],
    });
  });

  it('accepts tokens and rejects an empty one', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a.ts',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
      tokens: ['a', 'b', 'c'],
    };
    const empty = { ...finding, tokens: ['a', ''] };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(empty)).toThrow(TypeError);
    expect(validate({ findings: [empty] })).not.toEqual([]);
  });

  it('accepts the number of files of a folder finding and rejects zero', () => {
    const finding = {
      tool: 'tool',
      rule: 'rule',
      path: 'src/a',
      identity: 'id',
      message: 'message',
      classification: 'enforceable',
      ratchet: { key: 'depth', value: 5, pathIsFolder: true, folderFiles: 3 },
    };
    const none = { ...finding, ratchet: { ...finding.ratchet, folderFiles: 0 } };

    expect(parseFinding(finding)).toEqual(finding);
    expect(validate({ findings: [finding] })).toEqual([]);
    expect(() => parseFinding(none)).toThrow(TypeError);
    expect(validate({ findings: [none] })).not.toEqual([]);
  });

  it('is exercised by a validator that covers every keyword the schema uses', () => {
    expect(() => validate({ findings: [] })).not.toThrow();
    expect(() => validate({ findings: [] }, { oneOf: [] })).toThrow(/does not support/);
  });
});
