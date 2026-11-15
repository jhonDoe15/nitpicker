import { describe, expect, it } from 'vitest';
import {
  compactMetricFindings as untypedCompact,
  expandMetricFindings as untypedExpand,
} from './metric-groups.mjs';
import { evaluateStructure as untypedEvaluateStructure } from '../rules/structure.mjs';

type Entry = Readonly<Record<string, unknown>>;

const compact: (findings: readonly unknown[]) => Entry[] = untypedCompact;
const expand: (entries: unknown) => Entry[] = untypedExpand;
const evaluateStructure: (report: object, analyzerName: string) => Entry[] =
  untypedEvaluateStructure;

const metric = (name: string, value: number, overrides: Entry = {}) => ({
  tool: 'structure',
  rule: 'function-structure',
  path: 'src/a.ts',
  identity: `function:run:occurrence:1:${name}`,
  message: `${name} for run`,
  classification: 'descriptive',
  metric: { name, value },
  symbol: 'run',
  location: { line: 3 },
  ...overrides,
});

const fn = (overrides: Entry) => ({
  lines: 6,
  statements: 3,
  maxControlNesting: 1,
  parameters: 1,
  ...overrides,
});

const roundTrip = (findings: readonly unknown[]) =>
  expand(JSON.parse(JSON.stringify(compact(findings))));

describe('metric groups', () => {
  it('writes the metrics of one function as one entry and reads them back in order', () => {
    const findings = [metric('lines', 12), metric('statements', 4), metric('parameters', 2)];

    expect(compact(findings)).toEqual([
      {
        tool: 'structure',
        rule: 'function-structure',
        path: 'src/a.ts',
        identity: 'function:run:occurrence:1',
        classification: 'descriptive',
        symbol: 'run',
        location: { line: 3 },
        metrics: { lines: 12, statements: 4, parameters: 2 },
      },
    ]);
    expect(roundTrip(findings)).toEqual(findings);
  });

  it('keeps every finding of a structure report, limit failures included, and shrinks it', () => {
    const findings = evaluateStructure(
      {
        summary: { functions: 2 },
        functions: [
          fn({ file: 'src/a.ts', name: 'run', start: 1, end: 80, lines: 80 }),
          fn({ file: 'src/a.ts', name: 'run', start: 90, end: 95, parameters: 5 }),
          fn({ file: 'src/b.ts', name: '<anonymous>', start: undefined, maxControlNesting: 3 }),
        ],
        classes: [{ file: 'src/a.ts', name: 'A', start: 1, end: 99, methods: 2 }],
      },
      'structure',
    );

    expect(roundTrip(findings)).toEqual(findings);
    expect(compact(findings).filter((entry) => entry['classification'] === 'enforceable')).toEqual(
      findings.filter((finding) => finding['classification'] === 'enforceable'),
    );
    const metrics = findings.filter((finding) => finding['rule'] === 'function-structure');
    expect(JSON.stringify(compact(metrics)).length).toBeLessThan(
      JSON.stringify(metrics).length * 0.4,
    );
  });

  it('starts a new entry when the function, its line or an interleaved finding differ', () => {
    const findings = [
      metric('lines', 1),
      metric('lines', 2),
      metric('statements', 1, { location: { line: 4 } }),
      metric('parameters', 1, { identity: 'function:run:occurrence:2:parameters' }),
      {
        tool: 'structure',
        rule: 'x',
        path: '.',
        identity: 'x',
        message: 'x',
        classification: 'enforceable',
      },
      metric('statements', 3, { identity: 'function:run:occurrence:2:statements' }),
    ];

    expect(compact(findings).map((entry) => entry['metrics'] ?? entry['rule'])).toEqual([
      { lines: 1 },
      { lines: 2 },
      { statements: 1 },
      { parameters: 1 },
      'x',
      { statements: 3 },
    ]);
    expect(roundTrip(findings)).toEqual(findings);
  });

  it('leaves alone a metric finding it could not read back unchanged', () => {
    const findings = [
      metric('lines', 1, { message: 'lines of run' }),
      metric('lines', 1, { identity: 'function:run:lines-total' }),
      metric('lines', 1, { location: { line: 3, column: 2 } }),
      metric('lines', 1, { tokens: ['a'] }),
      metric('lines', Number.NaN),
      metric('__proto__', 1, { identity: 'function:run:__proto__', message: '__proto__ for run' }),
      metric('0', 1, { identity: 'function:run:0', message: '0 for run' }),
      metric('lines', 1, { classification: 'enforceable' }),
      metric('lines', 1, { identity: ':lines' }),
      { ...metric('lines', 1), symbol: undefined },
    ];

    expect(compact(findings)).toEqual(findings);
  });

  it('passes entries that are not metric groups through unchanged', () => {
    const entries = [
      metric('lines', 1),
      { metrics: { lines: 1 }, message: 'kept', identity: 'i', symbol: 's' },
      { metrics: {}, identity: 'i', symbol: 's' },
      7,
    ];

    expect(expand(entries)).toEqual(entries);
  });
});
