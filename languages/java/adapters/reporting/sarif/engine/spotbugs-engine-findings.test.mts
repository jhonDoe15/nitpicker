import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SarifLog } from '../../../jpa/jpa-types.mts';
import { readSarifReport } from '../sarif-reports.mts';
import { readSpotbugsReport, withSpotbugsEngineResults } from './spotbugs-engine-findings.mts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function result(rule: string, args: readonly string[], line = 1): Record<string, unknown> {
  return {
    ruleId: rule,
    message: { text: rule, arguments: args },
    locations: [
      { physicalLocation: { artifactLocation: { uri: 'p/A.java' }, region: { startLine: line } } },
    ],
  };
}

function log(...results: readonly Record<string, unknown>[]): SarifLog {
  return { version: '2.1.0', runs: [{ tool: { driver: { name: 'SpotBugs' } }, results }] };
}

function shown(merged: SarifLog): unknown[] {
  return (merged.runs ?? []).flatMap((run) =>
    (run.results ?? []).map((entry) => [entry.ruleId, ...(entry.message?.arguments ?? [])]),
  );
}

describe('withSpotbugsEngineResults', () => {
  it('adds the findings of the engine after those of SpotBugs, class by class', () => {
    const spotbugs = log(result('URF_UNREAD_FIELD', ['p.A.f']));
    const engine = log(
      result('EI_EXPOSE_REP2', ['p.B.set(Date)', 'B.d'], 9),
      result('EI_EXPOSE_REP2', ['p.A.set(Date)', 'A.d'], 8),
      result('EI_EXPOSE_REP2', ['p.A.set(Date)', 'A.d'], 6),
      result('CT_CONSTRUCTOR_THROW', ['p.A', 'new p.A()'], 4),
      result('EI_EXPOSE_REP', ['p.A.get()', 'A.d'], 5),
    );

    const merged = withSpotbugsEngineResults(spotbugs, engine);

    expect(shown(merged)).toStrictEqual([
      ['URF_UNREAD_FIELD', 'p.A.f'],
      ['CT_CONSTRUCTOR_THROW', 'p.A', 'new p.A()'],
      ['EI_EXPOSE_REP', 'p.A.get()', 'A.d'],
      ['EI_EXPOSE_REP2', 'p.A.set(Date)', 'A.d'],
      ['EI_EXPOSE_REP2', 'p.A.set(Date)', 'A.d'],
      ['EI_EXPOSE_REP2', 'p.B.set(Date)', 'B.d'],
    ]);
    const lines = (merged.runs?.[0]?.results ?? []).map(
      (entry) => entry.locations?.[0]?.physicalLocation?.region,
    );
    expect(lines.slice(3, 5)).toStrictEqual([{ startLine: 6 }, { startLine: 8 }]);
  });

  it('adds nothing when SpotBugs left no run', () => {
    const empty: SarifLog = { version: '2.1.0', runs: [] };

    expect(
      withSpotbugsEngineResults(empty, log(result('EI_EXPOSE_REP', ['p.A.get()', 'A.d']))),
    ).toBe(empty);
  });

  it('reads the report of SpotBugs with or without the one of the engine', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-spotbugs-merge-'));
    roots.push(root);
    writeFileSync(
      path.join(root, 'spotbugs.sarif'),
      JSON.stringify(log(result('URF_UNREAD_FIELD', ['p.A.f']))),
    );

    expect(shown(readSpotbugsReport(root, readSarifReport))).toStrictEqual([
      ['URF_UNREAD_FIELD', 'p.A.f'],
    ]);
    writeFileSync(
      path.join(root, 'spotbugs-engine.sarif'),
      JSON.stringify(log(result('EI_EXPOSE_REP', ['p.A.get()', 'A.d']))),
    );
    expect(shown(readSpotbugsReport(root, readSarifReport))).toStrictEqual([
      ['URF_UNREAD_FIELD', 'p.A.f'],
      ['EI_EXPOSE_REP', 'p.A.get()', 'A.d'],
    ]);
  });
});
