import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
import { GREW_MESSAGES, HELD_MESSAGES, MESSAGES, renderMessage } from '../../../shared/policy.mjs';
import { ingestPythonCrap } from './crap.mjs';

const fixture = (name) => readFileSync(path.resolve(import.meta.dirname, 'fixtures', name), 'utf8');
const functionEntries = () => JSON.parse(fixture('crap-functions.json'));
const entry = (file, name, [definition, end], complexity = 1) => ({
  file,
  name,
  start: definition,
  definition,
  bodyStart: definition + 1,
  end,
  complexity,
});
const ingest = (options = {}, functions = functionEntries()) =>
  ingestPythonCrap(functions, fixture('crap-coverage.json'), options).findings;

const scores = (options) =>
  ingest(options).map((finding) => {
    const crap = /CRAP (\d+\.\d+)/.exec(finding.message)?.[1] ?? 'unknown';
    return `${finding.symbol} ${crap}`;
  });

const ROUTE =
  ' If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["never.py"],"function":"B.go","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.';

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

  it('names a function by its qualified name, which is the name coverage.py reports, and scores the lower of line and branch coverage', () => {
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
    expect(ingest({}, [entry('other.py', 'f', [1, 2])])).toEqual([
      {
        tool: 'crap',
        rule: 'crap-coverage-unknown',
        path: 'other.py',
        symbol: 'f',
        identity: 'function:f',
        message:
          'f has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that. If a reviewer agrees this is intended, add {"rule":"crap-coverage-unknown","paths":["other.py"],"function":"f","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1 },
      },
    ]);
  });

  it('makes the coverage report paths relative to the given roots', () => {
    const coverage = fixture('crap-coverage.json').replace('"never.py"', '"/work/never.py"');
    const functions = [entry('never.py', 'coro', [8, 9])];
    const findings = ingestPythonCrap(functions, coverage, { roots: ['/work'], limit: 2 }).findings;

    expect(findings).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'never.py',
        symbol: 'coro',
        identity: 'function:coro',
        message:
          'coro has CRAP 2.00; score must be below 2. Test its uncovered branches, or split a branchy part into its own function. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["never.py"],"function":"coro","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 8 },
        ratchet: {
          key: 'function:coro:crap',
          value: 2,
          worseMessage:
            'coro CRAP rose from {base} to 2 (limit 2). Put new code in a new function and cover it with tests. If a reviewer agrees this is intended, add {"rule":"crap-score-limit","paths":["never.py"],"function":"coro","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
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

  it('does not take the coverage of a same-named entry whose lines lie outside the range of the function', () => {
    const shifted = functionEntries().map(({ start, definition, bodyStart, end, ...rest }) => ({
      ...rest,
      start: start + 40,
      definition: definition + 40,
      bodyStart: bodyStart + 40,
      end: end + 40,
    }));

    expect(ingest({ limit: 4 }, shifted)).toEqual([]);
  });

  it('includes the source hash in the identity of a function with known coverage only', () => {
    const functions = [...functionEntries(), entry('other.py', 'f', [1, 2])];
    const [known, unknown] = ingest({ limit: 4, sourceHash: () => 'abc' }, functions).filter(
      (finding) => finding.symbol !== 'top',
    );

    expect(known.identity).toBe('function:B.go:source:abc');
    expect(unknown.identity).toBe('function:f');
  });

  it('scores same-named definitions from the per-line data of their own ranges', () => {
    const functions = [
      entry('m.py', 'A.x', [6, 7]),
      entry('m.py', 'A.x', [10, 14], 2),
      entry('m.py', '_', [23, 24]),
      entry('m.py', '_', [28, 29]),
    ];
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

    const findings = ingestPythonCrap(functions, coverage, { limit: 2 }).findings;

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
    const functions = [entry('m.py', 'A.x', [6, 7])];
    const coverage = JSON.stringify({
      files: { 'm.py': { executed_lines: [6, 7], missing_lines: [], functions: {} } },
    });

    expect(ingestPythonCrap(functions, coverage, { limit: 2 }).findings).toEqual([]);
  });

  it('counts a function whose range holds no statement of a reported file as covered', () => {
    const functions = [entry('m.py', 'A.x', [6, 7], 4)];
    const coverage = JSON.stringify({
      files: { 'm.py': { executed_lines: [1], missing_lines: [], functions: {} } },
    });

    expect(ingestPythonCrap(functions, coverage, { limit: 5 }).findings).toEqual([]);
    expect(ingestPythonCrap(functions, coverage, { limit: 4 }).findings).toHaveLength(1);
  });

  it('does not score an overload stub, whatever the shape of its signature', () => {
    const stub = { ...entry('m.py', 'A.get', [6, 9], 3), overload: true };
    const coverage = JSON.stringify({
      files: { 'm.py': { executed_lines: [1], missing_lines: [], functions: {} } },
    });

    expect(ingestPythonCrap([stub], coverage, { limit: 1 }).findings).toEqual([]);
  });

  it('scores a branchy getter from its own lines when the setter that shares its name has none', () => {
    const functions = [entry('m.py', 'A.x', [6, 10], 5), entry('m.py', 'A.x', [12, 13])];
    const coverage = JSON.stringify({
      files: {
        'm.py': {
          executed_lines: [5, 6, 11, 12],
          missing_lines: [7, 8, 9, 10],
          executed_branches: [],
          missing_branches: [
            [7, 8],
            [7, 9],
          ],
          functions: {
            'A.x': {
              executed_lines: [],
              missing_lines: [],
              summary: {
                covered_lines: 0,
                num_statements: 0,
                covered_branches: 0,
                num_branches: 0,
              },
            },
          },
        },
      },
    });

    const findings = ingestPythonCrap(functions, coverage, { limit: 9 }).findings;

    expect(findings.map(({ symbol, location }) => [symbol, location.line])).toEqual([['A.x', 6]]);
    expect(findings[0].message).toMatch(/CRAP 30\.00/);
  });

  it('does not score a function whose body starts on its def line', () => {
    const oneLiner = { ...entry('never.py', 'one', [8, 8], 3), bodyStart: 8 };

    expect(ingest({ limit: 1 }, [oneLiner])).toEqual([]);
  });

  it('rejects a coverage report without files', () => {
    expect(() => ingestPythonCrap([], '{}')).toThrow('must contain a files object');
  });
});
