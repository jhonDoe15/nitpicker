import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseMoves, comparisonKey } from '../../../../core/diff/comparison/fingerprint.mjs';
import { ingestCoverageJson } from './coverage-json.mjs';

const report = readFileSync(path.join(import.meta.dirname, '..', 'fixtures/coverage.json'), 'utf8');

const file = (statements, covered, functions) => ({
  summary: { num_statements: statements, covered_lines: covered },
  functions,
});
const fn = (statements, covered) => ({
  summary: { num_statements: statements, covered_lines: covered },
});

describe('coverage.py JSON ingester', () => {
  it('reports line coverage per file and each function that never ran', () => {
    const { findings } = ingestCoverageJson(report);

    expect(findings).toEqual([
      {
        tool: 'coverage',
        rule: 'line-coverage',
        path: 'src/demo/shapes.py',
        identity: 'line-coverage',
        message: 'line-coverage 81.82% (9/11)',
        classification: 'descriptive',
        metric: { name: 'line-coverage', value: expect.closeTo(81.82, 10) },
      },
      {
        tool: 'coverage',
        rule: 'uncovered-function',
        path: 'src/demo/shapes.py',
        identity: 'cov:unused_helper',
        symbol: 'unused_helper',
        message: 'Function unused_helper is not covered',
        classification: 'descriptive',
      },
    ]);
  });

  it('skips files without statements', () => {
    const { findings } = ingestCoverageJson(JSON.stringify({ files: { 'a.py': file(0, 0) } }));

    expect(findings).toEqual([]);
  });

  it('flags only functions that have statements and none of them ran', () => {
    const { findings } = ingestCoverageJson(
      JSON.stringify({
        files: {
          'a.py': file(10, 5, {
            '': fn(3, 0),
            ran: fn(2, 2),
            partial: fn(4, 1),
            empty: fn(0, 0),
            'Klass.never': fn(2, 0),
            noSummary: {},
          }),
        },
      }),
    );

    expect(findings.filter(({ rule }) => rule === 'uncovered-function')).toEqual([
      {
        tool: 'coverage',
        rule: 'uncovered-function',
        path: 'a.py',
        identity: 'cov:Klass.never',
        symbol: 'Klass.never',
        message: 'Function Klass.never is not covered',
        classification: 'descriptive',
      },
    ]);
  });

  it('gives the same function in different files different comparison keys', () => {
    const { findings } = ingestCoverageJson(
      JSON.stringify({
        files: { 'a.py': file(2, 0, { run: fn(2, 0) }), 'b.py': file(2, 0, { run: fn(2, 0) }) },
      }),
    );

    const keys = findings
      .filter(({ rule }) => rule === 'uncovered-function')
      .map((finding) => comparisonKey(finding));
    expect(new Set(keys).size).toBe(2);
  });

  it('works with a report from before function data existed', () => {
    const { findings } = ingestCoverageJson(
      JSON.stringify({ files: { 'a.py': { summary: { num_statements: 4, covered_lines: 3 } } } }),
    );

    expect(findings.map(({ rule }) => rule)).toEqual(['line-coverage']);
  });

  it('makes paths project-relative against the first matching root', () => {
    const text = JSON.stringify({
      files: {
        '/work/proj/src/a.py': file(1, 1),
        'src/b.py': file(1, 1),
        '/elsewhere/c.py': file(1, 1),
        '../d.py': file(1, 1),
      },
    });

    const { findings } = ingestCoverageJson(text, { roots: ['/other', '/work/proj'] });

    expect(findings.map(({ path: findingPath }) => findingPath)).toEqual(['src/a.py', 'src/b.py']);
  });

  it('names the tool from the options', () => {
    const { findings } = ingestCoverageJson(JSON.stringify({ files: { 'a.py': file(1, 1) } }), {
      tool: 'cov',
    });

    expect(findings[0].tool).toBe('cov');
  });

  it.each(['{}', '[]', 'null', '{"files": 3}', '{"files": null}'])('rejects %s', (text) => {
    expect(() => ingestCoverageJson(text)).toThrow(
      'coverage.py JSON report must contain a files object',
    );
  });

  it('keeps the functions of a module moved to another package', () => {
    const keysAt = (module, renames) =>
      ingestCoverageJson(
        JSON.stringify({ files: { [module]: file(4, 0, { audit: fn(4, 0) }) } }),
      ).findings.map((finding) => comparisonKey(finding, renames && baseMoves(renames)));
    const before = 'src/shop/service/audit.py';
    const after = 'src/shop/audit/records.py';

    expect(keysAt(before, new Map([[before, after]]))).toEqual(keysAt(after));
  });
});
