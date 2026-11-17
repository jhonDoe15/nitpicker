import { describe, expect, it } from 'vitest';
import { writeDiffReports } from '../reporters.mts';
import { renderConsoleSummary } from '../summary.mts';
import { finding, report } from '../test-support/report-builders.mts';
import { compareFindings } from '../../comparison/test-support/typed-compare.mts';
import { isStrictRule } from '../../../../languages/typescript/preset/strict-rules.mts';
import { writeSnapshotReports } from '../../../snapshot/reporters.mts';
import { runQualitySnapshot } from '../../../snapshot/run-snapshot.mts';
import type { Finding } from '../../../../shared/values/findings.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { useGitFixtures } from '../../git/test-support/git-repository.mts';

const MORE_THAN_A_CALL_TAKES = 200_000;
const fixtures = useGitFixtures();

function outputRoot(): string {
  return fixtures.temporaryRoot('nitpicker-large-run-');
}

function manyFindings(prefix: string): Finding[] {
  return Array.from({ length: MORE_THAN_A_CALL_TAKES }, (_, index) =>
    finding({
      path: `src/file-${String(index % 500)}.ts`,
      identity: `${prefix}-${String(index)}`,
      message: `${prefix} ${String(index)}`,
      location: { line: (index % 900) + 1, column: 1 },
    }),
  );
}

describe('runs with more findings than one function call can take as arguments', () => {
  it('compares and writes the comparison reports', () => {
    const findings = manyFindings('kept');
    const compared = compareFindings({
      baseFindings: findings,
      headFindings: findings,
      touchedCode: { changedLines: new Map(), isStrictRule },
    });
    const large = report({ newFindings: manyFindings('new'), unchangedFindings: findings });

    const text = textOf(writeDiffReports(outputRoot(), large));
    const summary = renderConsoleSummary(large, { color: false, details: true });

    expect(compared.unchangedFindings).toHaveLength(MORE_THAN_A_CALL_TAKES);
    expect(text.split('\n').length).toBeGreaterThan(MORE_THAN_A_CALL_TAKES);
    expect(summary.split('\n').length).toBeGreaterThan(MORE_THAN_A_CALL_TAKES);
  });

  it('collects the findings of an --all run and writes its reports', () => {
    const findings = manyFindings('all');
    const analyzer = {
      name: 'house-rules',
      version: '1',
      configurationHash: 'large',
      exclusions: [],
      createInvocation: () => ({ command: process.execPath, args: ['--version'] }),
    };
    const snapshot = runQualitySnapshot({
      analyzers: [analyzer],
      projectRoot: outputRoot(),
      scope: undefined,
      runTasks: () => ({ reports: [['house-rules', { findings }]], errors: [], timings: [] }),
    });

    const text = textOf(writeSnapshotReports(outputRoot(), snapshot));

    expect(snapshot.toolErrors).toEqual([]);
    expect(snapshot.findings).toHaveLength(MORE_THAN_A_CALL_TAKES);
    expect(text.split('\n').length).toBeGreaterThan(MORE_THAN_A_CALL_TAKES);
  });
});
