import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { ingestPythonCrap } from './crap.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const ingest = (options = {}, lizard = fixture('crap-lizard.csv')) =>
  ingestPythonCrap(lizard, fixture('crap-coverage.json'), options).findings;

describe('ingestPythonCrap', () => {
  it('flags the uncovered method and the function no coverage entry matches, nothing else', () => {
    const findings = ingest({ limit: 4 });

    expect(findings.map((finding) => `${finding.rule} ${finding.symbol}`)).toEqual([
      'crap-coverage-unknown top',
      'crap-score-limit B.go',
    ]);
    expect(findings[1]).toMatchObject({
      tool: 'crap',
      path: 'never.py',
      classification: 'enforceable',
      message: expect.stringContaining('CRAP 6.00'),
      location: { line: 2 },
    });
    expect(() => parseAnalyzerReport({ findings }, 'python')).not.toThrow();
  });

  it('names a function by the qualified name coverage.py reports, not the bare lizard name', () => {
    const symbols = ingest({ limit: 2 }).map((finding) => finding.symbol);

    expect(symbols).toEqual(
      expect.arrayContaining(['A.m.inner', 'A.p', 'A.unused', 'B.go', 'coro', 'top']),
    );
  });

  it('uses the lower of line and branch coverage', () => {
    const [inner] = ingest({ limit: 2 });

    expect(inner.symbol).toBe('A.m.inner');
    expect(inner.message).toContain('CRAP 2.50');
  });

  it('counts a function without statements or branches as covered', () => {
    expect(ingest({ limit: 1 }).map((finding) => finding.symbol)).toContain('stub');
    expect(ingest({ limit: 1 }).find((finding) => finding.symbol === 'stub').message).toContain(
      'CRAP 1.00',
    );
    expect(ingest({ limit: 1.01 }).map((finding) => finding.symbol)).not.toContain('stub');
  });

  it('treats a file missing from the coverage report as unknown coverage', () => {
    const lizard = '2,1,7,1,2,"f@1-2@other.py","other.py","f","f( )",1,2\n';

    expect(ingest({}, lizard)).toEqual([
      expect.objectContaining({ rule: 'crap-coverage-unknown', symbol: 'f', path: 'other.py' }),
    ]);
  });

  it('makes the coverage report paths relative to the given roots', () => {
    const coverage = fixture('crap-coverage.json').replace('"never.py"', '"/work/never.py"');
    const lizard = '2,1,7,1,2,"never.py@8-9","never.py","coro","coro( )",8,9\n';
    const findings = ingestPythonCrap(lizard, coverage, { roots: ['/work'], limit: 2 }).findings;

    expect(findings).toEqual([expect.objectContaining({ symbol: 'coro', path: 'never.py' })]);
  });

  it('puts no line number in the identity', () => {
    for (const finding of ingest({ limit: 4 })) {
      expect(finding.identity).not.toMatch(/\d{2,}/);
    }
  });

  it('does not match coverage of lines outside the lizard range', () => {
    const shifted = fixture('crap-lizard.csv').replaceAll(
      /,(\d+),(\d+)$/gm,
      (_, a, b) => `,${Number(a) + 40},${Number(b) + 40}`,
    );

    expect(new Set(ingest({}, shifted).map((finding) => finding.rule))).toEqual(
      new Set(['crap-coverage-unknown']),
    );
  });

  it('includes the source hash in the identity of a function with known coverage only', () => {
    const [unknown, known] = ingest({ limit: 4, sourceHash: () => 'abc' });

    expect(known.identity).toBe('function:B.go:source:abc');
    expect(unknown.identity).toBe('function:top');
  });

  it('rejects a coverage report without files', () => {
    expect(() => ingestPythonCrap('', '{}')).toThrow('must contain a files object');
  });
});
