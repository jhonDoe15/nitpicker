import { describe, expect, it } from 'vitest';
import {
  comparisonOptions,
  fakeAnalyzer,
  useQualityDiffRepositories,
} from '../test-support/quality-diff-harness.mjs';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';
import { policy } from '../../../execution/test-support/analyzer-findings.mjs';
import { readMovesFile } from '../../../../../shared/rules/facts/baseline.mjs';
import { commit } from '../../../git/test-support/git-repository.mjs';
import { renameFile, writeFiles } from '../../../git/test-support/fixture-files.mjs';

const { createRepository } = useQualityDiffRepositories();

function recordingAnalyzer(seen) {
  const analyzer = fakeAnalyzer();
  return {
    ...analyzer,
    createInvocation(context) {
      seen.push([context.snapshot, [...readMovesFile(context.baselineMovesFile)]]);
      return analyzer.createInvocation(context);
    },
  };
}

describe('quality diff moves handed to the head analyzers', () => {
  it('gives the head run the renamed paths and the base run none', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old-name.ts': 'export const source = true;\n',
    });
    renameFile(repository.root, 'src/main/old-name.ts', 'src/main/new-name.ts');
    commit(repository.root, 'rename source');
    const seen = [];

    runQualityDiff({ ...comparisonOptions(repository), analyzers: [recordingAnalyzer(seen)] });

    expect(seen.toSorted()).toEqual([
      ['base', []],
      ['head', [['src/main/old-name.ts', 'src/main/new-name.ts']]],
    ]);
  });

  it('gives the head run no moves file when nothing was renamed', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(repository.root, { 'src/main/source.ts': 'export const source = false;\n' });
    commit(repository.root, 'edit source');
    const seen = [];

    runQualityDiff({ ...comparisonOptions(repository), analyzers: [recordingAnalyzer(seen)] });

    expect(seen.toSorted()).toEqual([
      ['base', []],
      ['head', []],
    ]);
  });
});
