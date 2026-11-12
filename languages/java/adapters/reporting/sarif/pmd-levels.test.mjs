import { describe, expect, it } from 'vitest';
import { ingestSarif } from '../../../../../shared/ingest/sarif.mjs';
import { withPmdLevels } from './pmd-levels.mjs';

function report(level) {
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

const kinds = (log) =>
  ingestSarif(log, { tool: 'pmd' }).findings.map(({ classification }) => classification);

describe('withPmdLevels', () => {
  it('reads every PMD priority as an enforced finding, as the pinned PMD did before it printed levels', () => {
    expect(['note', 'warning', 'error'].map((level) => kinds(report(level)))).toEqual([
      ['descriptive'],
      ['enforceable'],
      ['enforceable'],
    ]);
    expect(
      ['note', 'warning', 'error'].map((level) => kinds(withPmdLevels(report(level)))),
    ).toEqual([['enforceable'], ['enforceable'], ['enforceable']]);
  });

  it('drops the printed note and warning levels and keeps error', () => {
    const levels = ['note', 'warning', 'error'].map((level) => {
      const [run] = withPmdLevels(report(level)).runs;
      return [run.results[0].level, run.tool.driver.rules[0].defaultConfiguration.level];
    });
    expect(levels).toEqual([
      [undefined, undefined],
      [undefined, undefined],
      ['error', 'error'],
    ]);
  });

  it('leaves logs without runs, results or rules readable', () => {
    expect(withPmdLevels({ version: '2.1.0' })).toEqual({ version: '2.1.0', runs: [] });
    expect(withPmdLevels({ runs: [{ tool: { driver: { name: 'PMD' } } }] })).toEqual({
      runs: [{ tool: { driver: { name: 'PMD' } }, results: [] }],
    });
  });
});
