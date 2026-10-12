import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { GREW_MESSAGES, MESSAGES, renderMessage } from '../../../shared/policy.mjs';
import { ingestPythonCrap } from './crap.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const ingest = (options = {}, lizard = fixture('crap-lizard.csv')) =>
  ingestPythonCrap(lizard, fixture('crap-coverage.json'), options).findings;

const scores = (options) =>
  ingest(options).map((finding) => {
    const crap = /CRAP (\d+\.\d+)/.exec(finding.message)?.[1] ?? 'unknown';
    return `${finding.symbol} ${crap}`;
  });

describe('ingestPythonCrap', () => {
  it('flags the uncovered method and the function no coverage entry matches, nothing else', () => {
    const findings = ingest({ limit: 4 });

    expect(findings.map((finding) => `${finding.rule} ${finding.symbol}`)).toEqual([
      'crap-coverage-unknown top',
      'crap-score-limit B.go',
    ]);
    expect(findings[1]).toEqual({
      tool: 'crap',
      rule: 'crap-score-limit',
      path: 'never.py',
      identity: 'function:B.go',
      message: renderMessage(MESSAGES.crapScoreLimit, { name: 'B.go', crap: '6.00', limit: 4 }),
      classification: 'enforceable',
      symbol: 'B.go',
      location: { line: 2 },
      ratchet: {
        key: 'function:B.go:crap',
        value: 6,
        worseMessage: renderMessage(GREW_MESSAGES.crap, {
          name: 'B.go',
          crap: 6,
          limit: 4,
          base: '{base}',
        }),
      },
    });
    expect(() => parseAnalyzerReport({ findings }, 'python')).not.toThrow();
  });

  it('names a function by the qualified name coverage.py reports and scores the lower of line and branch coverage', () => {
    expect(scores({ limit: 2 })).toEqual([
      'A.m.inner 2.50',
      'A.m 2.00',
      'A.p 3.00',
      'A.unused 2.00',
      'top unknown',
      'B.go 6.00',
      'coro 2.00',
    ]);
  });

  it('counts a function without statements or branches as covered', () => {
    const stubs = (limit) => scores({ limit }).filter((score) => score.startsWith('stub'));

    expect(stubs(1)).toEqual(['stub 1.00']);
    expect(stubs(1.01)).toEqual([]);
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
