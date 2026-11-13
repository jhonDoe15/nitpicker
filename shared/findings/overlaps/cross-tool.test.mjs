import { describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { planAnalyzerShards } from '../../../core/diff/sharding/sharding.mts';
import {
  configuredAnalyzers,
  javascriptAnalyzers,
} from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { withoutCrossToolOverlaps, withoutSharedCrossToolOverlaps } from './cross-tool.mjs';
import { CROSS_TOOL_OVERLAPS, overlapTools } from './pairs.mjs';

const SILENT = {
  tool: 'eslint-errors',
  rule: 'nitpicker/no-silent-catch',
  path: 'src/main/a.ts',
  location: { line: 4, column: 5 },
  message: 'This catch discards the failure.',
};

function finding(tool, rule, line, message = 'm', path = 'src/main/a.ts', column = 12) {
  return { tool, rule, path, location: { line, column }, message };
}

function run(...findingsList) {
  const reports = new Map();
  for (const entry of findingsList) {
    const report = reports.get(entry.tool) ?? { findings: [], version: '1' };
    reports.set(entry.tool, { ...report, findings: [...report.findings, entry] });
  }
  return { reports, toolErrors: [] };
}

function keptBy(result, tool) {
  return result.reports.get(tool).findings;
}

describe('withoutCrossToolOverlaps', () => {
  it.each([
    ['@typescript-eslint/no-unused-vars', "Catch parameter 'e' is caught but never used."],
    ['no-unused-vars', "Catch parameter 'e' is caught but never used."],
    ['no-empty', 'Empty block statement.'],
  ])('drops %s where no-silent-catch reports the same line', (rule, message) => {
    const duplicate = finding('eslint-lint', rule, 4, message);
    const result = withoutCrossToolOverlaps(run(SILENT, duplicate));

    expect(keptBy(result, 'eslint-errors')).toEqual([SILENT]);
    expect(keptBy(result, 'eslint-lint')).toEqual([]);
  });

  it('keeps an unused catch parameter when no-silent-catch does not report the catch', () => {
    const unused = finding(
      'eslint-lint',
      '@typescript-eslint/no-unused-vars',
      10,
      'Catch parameter',
    );
    expect(keptBy(withoutCrossToolOverlaps(run(SILENT, unused)), 'eslint-lint')).toEqual([unused]);
  });

  it('keeps other unused variables on the line of a silent catch', () => {
    const variable = finding(
      'eslint-lint',
      '@typescript-eslint/no-unused-vars',
      4,
      "Variable 'x' is declared but never used.",
    );
    expect(keptBy(withoutCrossToolOverlaps(run(SILENT, variable)), 'eslint-lint')).toEqual([
      variable,
    ]);
  });

  it('keeps the empty try block that sits before the silent catch on the same line', () => {
    const emptyTry = finding('eslint-lint', 'no-empty', 4, 'Empty block statement.', undefined, 2);
    const emptyCatch = finding(
      'eslint-lint',
      'no-empty',
      4,
      'Empty block statement.',
      undefined,
      14,
    );
    const result = withoutCrossToolOverlaps(run(SILENT, emptyTry, emptyCatch));

    expect(keptBy(result, 'eslint-lint')).toEqual([emptyTry]);
  });

  it('matches by path and does not cross files', () => {
    const elsewhere = finding(
      'eslint-lint',
      'no-empty',
      4,
      'Empty block statement.',
      'src/main/b.ts',
    );
    expect(keptBy(withoutCrossToolOverlaps(run(SILENT, elsewhere)), 'eslint-lint')).toEqual([
      elsewhere,
    ]);
  });

  it('keeps everything when the covering analyzer did not run', () => {
    const empty = finding('eslint-lint', 'no-empty', 4, 'Empty block statement.');
    expect(keptBy(withoutCrossToolOverlaps(run(empty)), 'eslint-lint')).toEqual([empty]);
  });

  it('keeps findings without a line', () => {
    const unlocated = { ...finding('eslint-lint', 'no-empty', 4), location: undefined };
    expect(keptBy(withoutCrossToolOverlaps(run(SILENT, unlocated)), 'eslint-lint')).toEqual([
      unlocated,
    ]);
  });

  it('leaves the other fields of the run alone', () => {
    const input = { ...run(SILENT), timings: new Map([['a', 1]]), skipped: new Map() };
    const result = withoutCrossToolOverlaps(input);

    expect(result.timings).toBe(input.timings);
    expect(result.skipped).toBe(input.skipped);
    expect(input.reports.get('eslint-errors').findings).toEqual([SILENT]);
  });
});

describe('analyzers whose findings overlap', () => {
  it.each([
    ['typescript', configuredAnalyzers],
    ['javascript', javascriptAnalyzers],
  ])('are planned into one shard in the %s preset', (_name, analyzersOf) => {
    const analyzers = analyzersOf();
    const names = new Set(analyzers.map(({ name }) => name));
    expect(overlapTools().every((tool) => names.has(tool))).toBe(true);
    const sharing = [2, 3, 4].flatMap((shardCount) => {
      const shards = planAnalyzerShards(analyzers, shardCount);
      return CROSS_TOOL_OVERLAPS.map(({ primary, secondary }) =>
        shards.some((shard) => {
          const inShard = new Set(shard.map(({ name }) => name));
          return inShard.has(primary.tool) && inShard.has(secondary.tool);
        }),
      );
    });
    expect(new Set(sharing)).toEqual(new Set([true]));
  });
});

describe('withoutSharedCrossToolOverlaps', () => {
  const duplicate = finding('eslint-lint', 'no-empty', 4, 'Empty block statement.');

  it('drops the duplicate on both sides when the covering analyzer ran on both', () => {
    const { baseRun, headRun } = withoutSharedCrossToolOverlaps({
      baseRun: run(SILENT, duplicate),
      headRun: run(SILENT, duplicate),
    });

    expect(keptBy(baseRun, 'eslint-lint')).toEqual([]);
    expect(keptBy(headRun, 'eslint-lint')).toEqual([]);
  });

  it('keeps the duplicate on both sides when the covering analyzer is outside the head scope', () => {
    const { baseRun, headRun } = withoutSharedCrossToolOverlaps({
      baseRun: run(SILENT, duplicate),
      headRun: run(duplicate),
    });

    expect(keptBy(baseRun, 'eslint-lint')).toEqual([duplicate]);
    expect(keptBy(headRun, 'eslint-lint')).toEqual([duplicate]);
  });

  it('keeps the duplicate on both sides when the covering analyzer failed on the head', () => {
    const failed = { ...run(duplicate), toolErrors: [{ tool: 'eslint-errors', message: 'x' }] };
    const { baseRun, headRun } = withoutSharedCrossToolOverlaps({
      baseRun: run(SILENT, duplicate),
      headRun: failed,
    });

    expect(keptBy(baseRun, 'eslint-lint')).toEqual([duplicate]);
    expect(keptBy(headRun, 'eslint-lint')).toEqual([duplicate]);
  });

  it('does not turn the duplicate into a new finding when the head ran fewer analyzers', () => {
    const lint = { ...duplicate, identity: 'empty', classification: 'enforceable' };
    const { baseRun, headRun } = withoutSharedCrossToolOverlaps({
      baseRun: run(SILENT, lint),
      headRun: run(lint),
    });

    const { newFindings } = compareFindings({
      baseFindings: keptBy(baseRun, 'eslint-lint'),
      headFindings: keptBy(headRun, 'eslint-lint'),
      touchedCode: undefined,
    });

    expect(newFindings).toEqual([]);
  });
});
