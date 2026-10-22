import { describe, expect, it } from 'vitest';
import {
  normalizeBaselineExpansions,
  normalizeCoupling,
  normalizeStructure,
  normalizeTestRuntime,
} from '../../../../../languages/typescript/adapters/quality-areas/reporting/repository.mjs';
import { normalizeDeadCode } from '../../../../../languages/typescript/adapters/quality-areas/reporting/dead-code.mjs';
import { compareFindings } from '../../../comparison/compare.mjs';

describe('repository-level findings in the quality-area analyzers', () => {
  it('reports coding-standard baseline growth as enforceable', () => {
    const site = {
      file: 'src/main/example.ts',
      rule: 'example-rule',
      source: 'example()',
      count: 2,
    };

    expect(
      normalizeBaselineExpansions([{ ...site, count: 1 }], [site], 'coding-standards'),
    ).toEqual([
      {
        tool: 'coding-standards',
        rule: 'baseline-expansion',
        path: 'src/main/example.ts',
        identity: 'site:7faa3be0ab2f526b3a4562b4',
        message: 'Legacy allowance increased from 1 to 2 for example-rule',
        classification: 'enforceable',
      },
    ]);
    expect(normalizeBaselineExpansions([site], [site], 'coding-standards')).toEqual([]);
  });
  it('enforces new coupling stability-direction reversals', () => {
    const findings = normalizeCoupling(
      {
        stabilityDirection: [{ source: 'stable', target: 'volatile', delta: 0.5 }],
      },
      'coupling',
    );

    expect(findings).toEqual([
      {
        tool: 'coupling',
        rule: 'stability-direction',
        path: '.',
        identity: 'package-edge:stable->volatile',
        message: 'stable depends on less stable package volatile',
        classification: 'enforceable',
      },
      {
        tool: 'coupling',
        rule: 'stability-direction-metric',
        path: '.',
        identity: 'package-edge:stable->volatile',
        message: 'stable depends on less stable package volatile',
        classification: 'descriptive',
        metric: { name: 'instabilityDelta', value: 0.5 },
      },
    ]);
    expect(findings).toEqual([
      {
        tool: 'coupling',
        rule: 'stability-direction',
        path: '.',
        identity: 'package-edge:stable->volatile',
        message: 'stable depends on less stable package volatile',
        classification: 'enforceable',
      },
      {
        tool: 'coupling',
        rule: 'stability-direction-metric',
        path: '.',
        identity: 'package-edge:stable->volatile',
        message: 'stable depends on less stable package volatile',
        classification: 'descriptive',
        metric: { name: 'instabilityDelta', value: 0.5 },
      },
    ]);
  });
  it('enforces tests without a production runtime', () => {
    const findings = normalizeTestRuntime(
      {
        summary: {
          discoveredTests: 1,
          analyzedTests: 1,
          excludedTests: 0,
          findings: 1,
          categories: { 'no-production-runtime': 1 },
        },
        findings: [{ category: 'no-production-runtime', test: 'tests/orphan.test.ts' }],
      },
      'test-runtime',
    );

    expect(findings).toEqual([
      {
        tool: 'test-runtime',
        rule: 'test-runtime',
        path: '.',
        identity: 'summary:discoveredTests',
        message: 'discoveredTests summary',
        classification: 'descriptive',
        metric: { name: 'discoveredTests', value: 1 },
      },
      {
        tool: 'test-runtime',
        rule: 'test-runtime',
        path: '.',
        identity: 'summary:analyzedTests',
        message: 'analyzedTests summary',
        classification: 'descriptive',
        metric: { name: 'analyzedTests', value: 1 },
      },
      {
        tool: 'test-runtime',
        rule: 'test-runtime',
        path: '.',
        identity: 'summary:excludedTests',
        message: 'excludedTests summary',
        classification: 'descriptive',
        metric: { name: 'excludedTests', value: 0 },
      },
      {
        tool: 'test-runtime',
        rule: 'test-runtime',
        path: '.',
        identity: 'summary:findings',
        message: 'findings summary',
        classification: 'descriptive',
        metric: { name: 'findings', value: 1 },
      },
      {
        tool: 'test-runtime',
        rule: 'category-count',
        path: '.',
        identity: 'category:no-production-runtime',
        message: 'Tests classified as no-production-runtime',
        classification: 'descriptive',
        metric: { name: 'no-production-runtime', value: 1 },
      },
      {
        tool: 'test-runtime',
        rule: 'no-production-runtime',
        path: 'tests/orphan.test.ts',
        identity: 'test:tests/orphan.test.ts:source:8d9c747345db8de18b883037',
        message: 'Test has no production runtime',
        classification: 'enforceable',
      },
    ]);
  });
  it('enforces new unused files, exports, and types', () => {
    expect(
      normalizeDeadCode(
        {
          files: ['src/main/unused.ts'],
          issues: [
            {
              file: 'src/main/unused.ts',
              exports: [{ name: 'unusedValue', line: 4, col: 14 }],
              types: [{ name: 'UnusedType', line: 8, col: 13 }],
            },
          ],
        },
        'dead-code',
      ),
    ).toEqual([
      {
        tool: 'dead-code',
        rule: 'files',
        path: 'src/main/unused.ts',
        identity: 'file:src/main/unused.ts|source:83250426356270ef2c09e1be',
        message:
          'Unused file: src/main/unused.ts. Nothing imports it: delete it, or import it where it is needed.',
        classification: 'enforceable',
      },
      {
        tool: 'dead-code',
        rule: 'exports',
        path: 'src/main/unused.ts',
        identity: 'name:unusedValue|occurrence:1|source:83250426356270ef2c09e1be',
        message:
          'Export unusedValue is never imported. Remove `export`, or the declaration if nothing uses it.',
        classification: 'enforceable',
        location: { line: 4, column: 14 },
      },
      {
        tool: 'dead-code',
        rule: 'types',
        path: 'src/main/unused.ts',
        identity: 'name:UnusedType|occurrence:1|source:83250426356270ef2c09e1be',
        message:
          'Exported type UnusedType is never imported. Remove `export`, or the type if nothing uses it.',
        classification: 'enforceable',
        location: { line: 8, column: 13 },
      },
    ]);
  });
  it('tells which export to drop and why', () => {
    const messages = normalizeDeadCode(
      {
        files: ['src/main/orphan.ts'],
        issues: [
          {
            file: 'src/main/a.ts',
            types: [
              { name: 'Rejection', line: 1, col: 13 },
              { name: 'Local', line: 2, col: 13, usedInFile: true },
            ],
            exports: [{ name: 'helper', line: 5, col: 17 }],
            binaries: [{ name: 'left-pad' }],
          },
        ],
      },
      'dead-code',
    ).map(({ message }) => message);

    expect(messages).toEqual([
      'Unused file: src/main/orphan.ts. Nothing imports it: delete it, or import it where it is needed.',
      'Exported type Rejection is never imported. Remove `export`, or the type if nothing uses it.',
      'Exported type Local is only used in its own file. Remove `export`.',
      'Export helper is never imported. Remove `export`, or the declaration if nothing uses it.',
      'binaries: left-pad',
    ]);
  });
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
  it('enforces oversized or deeply nested changed functions', () => {
    const findings = normalizeStructure(
      {
        functions: [
          {
            source: 'src/main/value.ts',
            function: 'value',
            sourceHash: 'changed-function',
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
    );

    expect(
      findings
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ rule }) => rule),
    ).toEqual([
      'function-lines-limit',
      'function-statements-limit',
      'function-control-nesting-limit',
      'function-parameters-limit',
    ]);
  });
  it('keeps anonymous structure identities stable when preceding lines move', () => {
    function findingsAt(start) {
      return normalizeStructure(
        {
          functions: [
            {
              source: 'src/main/callbacks.ts',
              function: '<anonymous>',
              sourceHash: 'unchanged-callback',
              start,
              end: start + 50,
              lines: 51,
              statements: 1,
              maxControlNesting: 0,
              parameters: 0,
            },
          ],
        },
        'structure',
      );
    }

    const comparison = compareFindings({
      baseFindings: findingsAt(10),
      headFindings: findingsAt(11),
    });

    expect(comparison.newFindings).toEqual([]);
    expect(comparison.resolvedFindings).toEqual([]);
  });
});
