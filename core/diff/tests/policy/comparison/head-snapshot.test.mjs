import { describe, expect, it } from 'vitest';
import {
  commitFiles,
  comparisonOptions,
  useQualityDiffRepositories,
} from '../test-support/quality-diff-harness.mjs';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mjs';
import { fixtureGit } from '../../../git/test-support/git-repository.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';

const { createRepository } = useQualityDiffRepositories();

describe('quality diff head snapshot', () => {
  it('uses the head policy for both snapshots', () => {
    const repository = createRepository({
      'quality-policy.json': policy({ marker: 'OLD_QUALITY' }),
      'src/main/policy.ts': [
        findingLine(finding({ identity: 'old-policy' }), 'OLD_QUALITY'),
        findingLine(finding({ identity: 'head-policy' }), 'HEAD_QUALITY'),
      ].join(''),
    });
    commitFiles(
      repository.root,
      { 'quality-policy.json': policy({ marker: 'HEAD_QUALITY' }) },
      'change policy',
    );

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['head-policy']);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
  });
  it('uses an explicit dependency from the head checkout for base analysis', () => {
    const repository = createRepository({
      'quality-policy.json': policy({
        markerDependency: 'fake-policy/marker.txt',
      }),
      'src/main/policy.ts': findingLine(
        finding({ identity: 'head-dependency' }),
        'DEPENDENCY_QUALITY',
      ),
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'create head');
    writeFiles(repository.root, {
      'node_modules/fake-policy/marker.txt': 'DEPENDENCY_QUALITY\n',
    });

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['head-dependency']);
    expect(report.newFindings).toEqual([]);
    expect(report.toolErrors).toEqual([]);
  });
  it('analyzes the committed head snapshot instead of live source changes', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'create head');
    writeFiles(repository.root, {
      'src/main/uncommitted.ts': findingLine(finding({ identity: 'uncommitted-source' })),
    });

    const report = runQualityDiff(comparisonOptions(repository));

    expect(report.newFindings).toEqual([]);
    expect(report.summary.headSha).toBe(fixtureGit(repository.root, ['rev-parse', 'HEAD']).trim());
  });
});
