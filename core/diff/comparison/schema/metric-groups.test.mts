import { describe, expect, it } from 'vitest';
import { normalizeStructure } from '../../../../languages/typescript/adapters/quality-areas/reporting/repository.mts';
import { compactMetricFindings as untypedCompact } from '../../../../shared/report-output/metric-groups.mjs';
import { compareFindings } from '../test-support/typed-compare.mts';
import { parseAnalyzerReport } from '../test-support/parsed-findings.mts';
import { parseAnalyzerReportKeepingValid as untypedKeepingValid } from './invalid-findings.mjs';

type Findings = readonly Readonly<Record<string, unknown>>[];

const compact: (findings: readonly unknown[]) => readonly unknown[] = untypedCompact;
const parseKeepingValid: (value: unknown, analyzerName: string) => { readonly findings: Findings } =
  untypedKeepingValid;

type Function = Readonly<Record<string, unknown>>;

const callback = (overrides: Function = {}): Function => ({
  source: 'src/main/callbacks.ts',
  function: '<anonymous>',
  sourceHash: 'callback',
  start: 10,
  end: 20,
  lines: 11,
  statements: 4,
  maxControlNesting: 1,
  parameters: 1,
  ...overrides,
});

const handler = (overrides: Function = {}): Function => ({
  ...callback(),
  source: 'src/main/handler.ts',
  function: 'handle',
  sourceHash: 'handler',
  start: 1,
  end: 60,
  lines: 60,
  statements: 18,
  ...overrides,
});

const written = (functions: readonly Function[]) =>
  JSON.stringify({ findings: compact(normalizeStructure({ functions }, 'structure')) });

const perMetric = (functions: readonly Function[]) =>
  parseAnalyzerReport({ findings: normalizeStructure({ functions }, 'structure') }, 'structure')
    .findings;

const grouped = (functions: readonly Function[]) =>
  parseAnalyzerReport(JSON.parse(written(functions)), 'structure').findings;

const comparisons = (base: readonly Function[], head: readonly Function[]) => ({
  expected: compareFindings({ baseFindings: perMetric(base), headFindings: perMetric(head) }),
  actual: compareFindings({ baseFindings: grouped(base), headFindings: grouped(head) }),
});

describe('grouped structure metrics', () => {
  it('read back as the findings the structure rule built, through either parser', () => {
    const functions = [handler(), callback(), callback({ start: 30, end: 40 })];

    expect(grouped(functions)).toEqual(perMetric(functions));
    expect(parseKeepingValid(JSON.parse(written(functions)), 'structure').findings).toEqual(
      perMetric(functions),
    );
  });

  it('compare like per-metric findings when one metric of a function grows', () => {
    const { expected, actual } = comparisons(
      [handler(), callback()],
      [
        handler({ statements: 19, lines: 61, end: 61, sourceHash: 'grown' }),
        callback({ maxControlNesting: 3 }),
      ],
    );

    expect(actual).toEqual(expected);
    expect(actual.changedMetrics.map(({ identity }) => identity)).toEqual([
      'function:<anonymous>:occurrence:1:maxControlNesting',
      'function:handle:occurrence:1:lines',
      'function:handle:occurrence:1:statements',
    ]);
    expect(actual.newFindings.map(({ rule }) => rule)).toEqual([
      'function-control-nesting-limit',
      'function-lines-limit',
      'function-statements-limit',
    ]);
  });

  it('compare like per-metric findings when a function is renamed or a callback moves', () => {
    const { expected, actual } = comparisons(
      [handler(), callback()],
      [handler({ function: 'process' }), callback({ start: 12, end: 22 })],
    );

    expect(actual).toEqual(expected);
    expect(actual.newFindings.map(({ identity }) => identity)).toEqual([
      'function:process:occurrence:1:source:handler',
      'function:process:occurrence:1:source:handler',
      'function:process:occurrence:1:lines',
      'function:process:occurrence:1:maxControlNesting',
      'function:process:occurrence:1:parameters',
      'function:process:occurrence:1:statements',
    ]);
  });
});
