import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commitFiles,
  createRepository,
  finding,
  findingLine,
  git,
  policy,
  registerRepositoryLifecycle,
  renameFile,
  workingTreeOptions,
  writeFiles,
} from '../quality-diff-harness.mjs';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';

registerRepositoryLifecycle();

describe('quality diff against the working tree', () => {
  it('reports a finding in an untracked file as new', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    writeFiles(repository.root, {
      'src/main/untracked.ts': findingLine(finding({ identity: 'untracked' })),
    });

    const report = runQualityDiff(workingTreeOptions(repository));

    expect(report.newFindings.map((entry) => entry.identity)).toEqual(['untracked']);
    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['stable']);
  });
  it('reports an unstaged edit and ignores ignored files', () => {
    const repository = createRepository({
      '.gitignore': 'scratch/\n',
      'quality-policy.json': policy(),
      'src/main/edited.ts': findingLine(finding({ identity: 'removed' })),
    });
    writeFiles(repository.root, {
      'src/main/edited.ts': findingLine(finding({ identity: 'added' })),
      'scratch/ignored.ts': findingLine(finding({ identity: 'ignored' })),
    });

    const report = runQualityDiff(workingTreeOptions(repository));

    expect(report.newFindings.map((entry) => entry.identity)).toEqual(['added']);
    expect(report.resolvedFindings.map((entry) => entry.identity)).toEqual(['removed']);
  });
  it('follows an uncommitted rename', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old-name.ts': findingLine(finding({ identity: 'renamed', identityFromPath: true })),
    });
    renameFile(repository.root, 'src/main/old-name.ts', 'src/main/new-name.ts');

    const report = runQualityDiff(workingTreeOptions(repository));

    expect(report.summary.renamedPaths).toBe(1);
    expect(report.unchangedFindings.map((entry) => entry.path)).toEqual(['src/main/new-name.ts']);
    expect(report.newFindings).toEqual([]);
  });
  it('compares with HEAD itself when the checkout is clean', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });
    commitFiles(repository.root, { 'src/main/later.ts': 'export {};\n' }, 'later');

    const report = runQualityDiff(workingTreeOptions(repository));

    expect(report.summary.headSha).toBe(git(repository.root, ['rev-parse', 'HEAD']).trim());
  });
  it('leaves the index, branches, and files untouched', () => {
    const repository = createRepository({
      '.gitignore': 'reports/\n',
      'quality-policy.json': policy(),
      'src/main/staged.ts': 'export const before = 1;\n',
    });
    writeFiles(repository.root, {
      'src/main/staged.ts': 'export const after = 1;\n',
      'src/main/untracked.ts': 'export {};\n',
    });
    git(repository.root, ['add', 'src/main/staged.ts']);
    writeFiles(repository.root, {
      'src/main/staged.ts': 'export const unstaged = 1;\n',
    });
    const statusBefore = git(repository.root, ['status', '--porcelain']);
    const stagedBefore = git(repository.root, ['diff', '--cached']);
    const refsBefore = git(repository.root, ['for-each-ref']);

    runQualityDiff(workingTreeOptions(repository));

    expect(git(repository.root, ['status', '--porcelain'])).toBe(statusBefore);
    expect(git(repository.root, ['diff', '--cached'])).toBe(stagedBefore);
    expect(git(repository.root, ['for-each-ref'])).toBe(refsBefore);
    expect(readFileSync(path.join(repository.root, 'src/main/staged.ts'), 'utf8')).toBe(
      'export const unstaged = 1;\n',
    );
  });
});
