import { describe, expect, it } from 'vitest';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';
import { callUntyped } from '../../typed/java-values.mts';
import { ingestSarif } from '../../../../../shared/ingest/sarif.mjs';
import { withPmdLevels } from './pmd-levels.mts';

function report(level: string): object {
  return {
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'PMD',
            rules: [{ id: 'DontCallThreadRun', defaultConfiguration: { level } }],
          },
        },
        results: [
          {
            ruleId: 'DontCallThreadRun',
            level,
            message: { text: 'Do not call Thread.run()' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: 'src/main/java/demo/Banned.java' },
                  region: { startLine: 7 },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function kinds(log: unknown): unknown[] {
  return listOf(fieldOf(callUntyped(ingestSarif, log, { tool: 'pmd' }), 'findings')).map(
    (finding) => fieldOf(finding, 'classification'),
  );
}

function leveled(log: unknown): unknown {
  return callUntyped(withPmdLevels, log);
}

describe('withPmdLevels', () => {
  it('reads every PMD priority as an enforced finding, as the pinned PMD did before it printed levels', () => {
    expect(['note', 'warning', 'error'].map((level) => kinds(report(level)))).toEqual([
      ['descriptive'],
      ['enforceable'],
      ['enforceable'],
    ]);
    expect(['note', 'warning', 'error'].map((level) => kinds(leveled(report(level))))).toEqual([
      ['enforceable'],
      ['enforceable'],
      ['enforceable'],
    ]);
  });

  it('drops the printed note and warning levels and keeps error', () => {
    const levels = ['note', 'warning', 'error'].map((level) => {
      const [run] = listOf(fieldOf(leveled(report(level)), 'runs'));
      const [result] = listOf(fieldOf(run, 'results'));
      const [rule] = listOf(fieldOf(fieldOf(fieldOf(run, 'tool'), 'driver'), 'rules'));
      return [fieldOf(result, 'level'), fieldOf(fieldOf(rule, 'defaultConfiguration'), 'level')];
    });
    expect(levels).toEqual([
      [undefined, undefined],
      [undefined, undefined],
      ['error', 'error'],
    ]);
  });

  it('leaves logs without runs, results or rules readable', () => {
    expect(leveled({ version: '2.1.0' })).toEqual({ version: '2.1.0', runs: [] });
    expect(leveled({ runs: [{ tool: { driver: { name: 'PMD' } } }] })).toEqual({
      runs: [{ tool: { driver: { name: 'PMD' } }, results: [] }],
    });
  });
});
