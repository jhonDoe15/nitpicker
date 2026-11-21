import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseJson } from '../../../../../../shared/values/readers.mts';
import type { SarifLog } from '../../../jpa/jpa-types.mts';
import { readPmdReport, withEngineResults } from './pmd-engine-findings.mts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function result(rule: string, file: string, place: readonly [number, number]): Record<string, unknown> {
  return {
    ruleId: rule,
    message: { text: `${rule} found` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: `file://${file}` },
          region: { startLine: place[0], startColumn: place[1] },
        },
      },
    ],
  };
}

function note(file: string, text: string): Record<string, unknown> {
  return {
    locations: [{ physicalLocation: { artifactLocation: { uri: `file://${file}` } } }],
    message: { text },
  };
}

function rulesOf(log: SarifLog): unknown[] {
  return (log.runs ?? []).flatMap((run) => (run.results ?? []).map(({ ruleId }) => ruleId));
}

describe('withEngineResults', () => {
  it('puts the findings of the engine among the findings of PMD in report order', () => {
    const pmd = {
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'PMD' } },
          results: [result('B', '/p/A.java', [2, 1]), result('D', '/p/B.java', [1, 1])],
        },
      ],
    };
    const engine = {
      runs: [
        {
          results: [
            result('E', '/p/B.java', [1, 1]),
            result('C', '/p/A.java', [2, 9]),
            result('A', '/p/A.java', [1, 4]),
          ],
        },
      ],
    };

    const merged = withEngineResults(pmd, engine);

    expect(rulesOf(merged)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(merged.runs?.[0]?.['tool']).toEqual({ driver: { name: 'PMD' } });
  });

  it('drops what the engine found in a file PMD could not read', () => {
    const pmd = {
      runs: [
        {
          results: [],
          invocations: [
            {
              toolExecutionNotifications: [
                note('/p/Broken.java', 'ParseException: Parse exception in file'),
                note('/p/Fine.java', 'Rule applied on node ASTMethodCall'),
              ],
            },
          ],
        },
      ],
    };
    const engine = {
      runs: [{ results: [result('A', '/p/Broken.java', [1, 1]), result('B', '/p/Fine.java', [1, 1])] }],
    };

    expect(rulesOf(withEngineResults(pmd, engine))).toEqual(['B']);
  });

  it('keeps the findings of the engine when PMD wrote no run', () => {
    const engine = { runs: [{ tool: { driver: { name: 'PMD' } }, results: [result('A', '/p/A.java', [1, 1])] }] };

    expect(rulesOf(withEngineResults({ version: '2.1.0', runs: [] }, engine))).toEqual(['A']);
  });
});

describe('readPmdReport', () => {
  function read(file: string): SarifLog {
    const log: unknown = parseJson(readFileSync(file, 'utf8'));
    return typeof log === 'object' && log !== null ? log : {};
  }

  it('reads the report of PMD alone when the engine did not run', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-report-'));
    roots.push(root);
    writeFileSync(path.join(root, 'pmd.sarif'), JSON.stringify({ runs: [{ results: [result('A', '/p/A.java', [1, 1])] }] }));

    expect(rulesOf(readPmdReport(root, read))).toEqual(['A']);

    writeFileSync(
      path.join(root, 'pmd-engine.sarif'),
      JSON.stringify({ runs: [{ results: [result('B', '/p/A.java', [1, 2])] }] }),
    );

    expect(rulesOf(readPmdReport(root, read))).toEqual(['A', 'B']);
  });
});
