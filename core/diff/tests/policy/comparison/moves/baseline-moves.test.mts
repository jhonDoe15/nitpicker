import { describe, expect, it } from 'vitest';
import {
  comparisonOptions,
  fakeAnalyzer,
  useQualityDiffRepositories,
} from '../../test-support/quality-diff-harness.mts';
import { runQualityDiff } from '../../../../comparison/run-diff.mts';
import { policy } from '../../../../execution/test-support/analyzer-findings.mts';
import { readMovesFile } from '../../../../../../shared/rules/facts/baseline.mjs';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { commit } from '../../../../git/test-support/git-repository.mts';
import { renameFile, writeFiles } from '../../../../git/test-support/fixture-files.mts';

const { createRepository } = useQualityDiffRepositories();

const movesOf: (movesFile: unknown) => Map<string, string> = readMovesFile;

function recordingAnalyzer(seen: unknown[]) {
  const analyzer = fakeAnalyzer();
  return {
    ...analyzer,
    createInvocation(context: unknown) {
      seen.push([
        fieldOf(context, 'snapshot'),
        [...movesOf(fieldOf(context, 'baselineMovesFile'))],
      ]);
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
    const seen: unknown[] = [];

    runQualityDiff({ ...comparisonOptions(repository), analyzers: [recordingAnalyzer(seen)] });

    expect(seen.toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
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
    const seen: unknown[] = [];

    runQualityDiff({ ...comparisonOptions(repository), analyzers: [recordingAnalyzer(seen)] });

    expect(seen.toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
      ['base', []],
      ['head', []],
    ]);
  });
});
