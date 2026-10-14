import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { GREW_MESSAGES, HELD_MESSAGES, MESSAGES, renderMessage } from '../../../shared/policy.mjs';
import { ingestPythonCrap } from './crap.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const ingest = (options = {}, lizard = fixture('crap-lizard.csv')) =>
  ingestPythonCrap(lizard, fixture('crap-coverage.json'), options).findings;

const scores = (options) =>
  ingest(options).map((finding) => {
    const crap = /CRAP (\d+\.\d+)/.exec(finding.message)?.[1] ?? 'unknown';
    return `${finding.symbol} ${crap}`;
  });

const ROUTE =
  ' If this is intended, add {"rule":"crap-score-limit","paths":["never.py"],"function":"B.go","reason":"..."} to "exceptions" in nitpicker.config.json.';

describe('ingestPythonCrap', () => {
  it('flags the uncovered methods over the limit, nothing else', () => {
    const findings = ingest({ limit: 4 });

    expect(findings.map((finding) => `${finding.rule} ${finding.symbol}`)).toEqual([
      'crap-score-limit top',
      'crap-score-limit B.go',
    ]);
    expect(findings[1]).toEqual({
      tool: 'crap',
      rule: 'crap-score-limit',
      path: 'never.py',
      identity: 'function:B.go',
      message: `${renderMessage(MESSAGES.crapScoreLimit, { name: 'B.go', crap: '6.00', limit: 4 })}${ROUTE}`,
      classification: 'enforceable',
      symbol: 'B.go',
      location: { line: 2 },
      ratchet: {
        key: 'function:B.go:crap',
        value: 6,
        worseMessage: `${renderMessage(GREW_MESSAGES.crap, {
          name: 'B.go',
          crap: 6,
          limit: 4,
          base: '{base}',
        })}${ROUTE}`,
        heldMessage: renderMessage(HELD_MESSAGES.crap, {
          name: 'B.go',
          crap: '6.00',
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
      'top 12.00',
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
      {
        tool: 'crap',
        rule: 'crap-coverage-unknown',
        path: 'other.py',
        symbol: 'f',
        identity: 'function:f',
        message:
          'f has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that. If this is intended, add {"rule":"crap-coverage-unknown","paths":["other.py"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1 },
      },
    ]);
  });

  it('makes the coverage report paths relative to the given roots', () => {
    const coverage = fixture('crap-coverage.json').replace('"never.py"', '"/work/never.py"');
    const lizard = '2,1,7,1,2,"never.py@8-9","never.py","coro","coro( )",8,9\n';
    const findings = ingestPythonCrap(lizard, coverage, { roots: ['/work'], limit: 2 }).findings;

    expect(findings).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'never.py',
        symbol: 'coro',
        identity: 'function:coro',
        message:
          'coro has CRAP 2.00; score must be below 2. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["never.py"],"function":"coro","reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 8 },
        ratchet: {
          key: 'function:coro:crap',
          value: 2,
          worseMessage:
            'coro CRAP rose from {base} to 2 (limit 2). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["never.py"],"function":"coro","reason":"..."} to "exceptions" in nitpicker.config.json.',
          heldMessage:
            'coro: CRAP 2.00 (limit 2), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
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
    const lizard = `${fixture('crap-lizard.csv')}2,1,7,1,2,"f@1-2@other.py","other.py","f","f( )",1,2\n`;
    const [known, unknown] = ingest({ limit: 4, sourceHash: () => 'abc' }, lizard).filter(
      (finding) => finding.symbol !== 'top',
    );

    expect(known.identity).toBe('function:B.go:source:abc');
    expect(unknown.identity).toBe('function:f');
  });

  it('scores same-named definitions from the per-line data of their own ranges', () => {
    const lizard = [
      '2,1,9,1,2,"x@6-7@m.py","m.py","x","x( self )",6,7',
      '5,2,22,2,5,"x@10-14@m.py","m.py","x","x( self , v )",10,14',
      '2,1,9,1,2,"_@23-24@m.py","m.py","_","_( a : int )",23,24',
      '2,1,9,1,2,"_@28-29@m.py","m.py","_","_( a : str )",28,29',
      '',
    ].join('\n');
    const coverage = JSON.stringify({
      files: {
        'm.py': {
          executed_lines: [5, 6, 7, 9, 10, 11, 12, 22, 23, 24, 27, 28],
          missing_lines: [14, 29],
          executed_branches: [[11, 12]],
          missing_branches: [[11, 14]],
          functions: {
            'A.x': {
              executed_lines: [11, 12],
              missing_lines: [14],
              executed_branches: [[11, 12]],
              missing_branches: [[11, 14]],
              summary: {
                covered_lines: 2,
                num_statements: 3,
                covered_branches: 1,
                num_branches: 2,
              },
            },
            _: {
              executed_lines: [],
              missing_lines: [29],
              summary: {
                covered_lines: 0,
                num_statements: 1,
                covered_branches: 0,
                num_branches: 0,
              },
            },
          },
        },
      },
    });

    const findings = ingestPythonCrap(lizard, coverage, { limit: 2 }).findings;

    expect(findings.map(({ rule, symbol, location }) => [rule, symbol, location.line])).toEqual([
      ['crap-score-limit', 'A.x', 10],
      ['crap-score-limit', '_', 28],
    ]);
    expect(findings.map(({ message }) => /CRAP (\d+\.\d+)/.exec(message)[1])).toEqual([
      '2.50',
      '2.00',
    ]);
  });

  it('keeps a same-named definition out of the findings when its own lines are covered', () => {
    const lizard = '2,1,9,1,2,"x@6-7@m.py","m.py","x","x( self )",6,7\n';
    const coverage = JSON.stringify({
      files: { 'm.py': { executed_lines: [6, 7], missing_lines: [], functions: {} } },
    });

    expect(ingestPythonCrap(lizard, coverage, { limit: 2 }).findings).toEqual([]);
  });

  it('leaves coverage unknown for a function whose range holds no statement of the file', () => {
    const lizard = '2,1,9,1,2,"x@6-7@m.py","m.py","x","x( self )",6,7\n';
    const coverage = JSON.stringify({
      files: { 'm.py': { executed_lines: [1], missing_lines: [], functions: {} } },
    });

    expect(ingestPythonCrap(lizard, coverage, {}).findings.map(({ rule }) => rule)).toEqual([
      'crap-coverage-unknown',
    ]);
  });

  it('rejects a coverage report without files', () => {
    expect(() => ingestPythonCrap('', '{}')).toThrow('must contain a files object');
  });
});
