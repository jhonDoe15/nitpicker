import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';
import { createBaseSetupResolver } from './base-setup.mts';
import { configureAnalyzers } from '../../configuration/configure-analyzers.mts';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mts';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';

const { createGitRepository } = useGitFixtures();

function baseWith(config: object): string {
  return createGitRepository({
    'nitpicker.config.json': JSON.stringify(config),
    'src/a.ts': 'export {};\n',
  }).root;
}

type DuplicateAnalyzer = {
  readonly createInvocation: (context: object) => { readonly args: readonly string[] };
};

function isDuplicateAnalyzer(value: unknown): value is DuplicateAnalyzer {
  return typeof fieldOf(value, 'createInvocation') === 'function';
}

function duplicateArguments(analyzer: DuplicateAnalyzer): string | undefined {
  const { args } = analyzer.createInvocation({
    projectRoot: '/p',
    toolRoot: '/t',
    snapshot: 'base',
    projectPolicyRoot: tmpdir(),
    baselineRoot: tmpdir(),
  });
  const index = args.indexOf('--duplicate-skipped-folders');
  return index < 0 ? undefined : args[index + 1];
}

describe.each([
  ['java', ['["build"]', undefined]],
  ['kotlin', ['["build"]', undefined]],
  ['python', ['["build"]', undefined, undefined]],
])('the base of a %s project', (preset, expected) => {
  const headConfig = { preset, duplicates: { skippedFolders: ['build'] } };
  const headAnalyzers = configureAnalyzers(
    presetAnalyzers(headConfig),
    headConfig,
    resolveHeadPolicy(headConfig),
  );

  it('runs its duplicate scan with the head folder list, whatever the base config says', () => {
    const resolve = createBaseSetupResolver({ headConfig });
    const analyzersOfBase = (base: object): readonly DuplicateAnalyzer[] => {
      const own = fieldOf(base, 'analyzers');
      return own === undefined ? headAnalyzers : listOf(own).filter(isDuplicateAnalyzer);
    };
    const duplicates = (analyzers: readonly DuplicateAnalyzer[]) =>
      analyzers.map(duplicateArguments);
    const bases = [
      { preset },
      { preset, duplicates: { skippedFolders: ['dist'] } },
      { preset, thresholds: { crapLimit: 12 } },
      { preset, thresholds: { crapLimit: 12 }, duplicates: { skippedFolders: ['dist'] } },
    ].map((config) => {
      const headRoot = baseWith({});
      return resolve({
        baseProjectRoot: baseWith(config),
        headSnapshotRoot: headRoot,
        liveProjectRoot: headRoot,
        moves: undefined,
        analyzers: headAnalyzers,
      });
    });

    expect(bases.map((base) => duplicates(analyzersOfBase(base)))).toEqual(
      Array.from({ length: 4 }, () => duplicates(headAnalyzers)),
    );
    expect(headAnalyzers.map(duplicateArguments)).toEqual(expected);
  });
});
