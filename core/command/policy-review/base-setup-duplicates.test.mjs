import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { createBaseSetupResolver } from './base-setup.mjs';
import { configureAnalyzers } from '../../configuration/configure-analyzers.mjs';
import { presetAnalyzers } from '../../configuration/preset-analyzers.mjs';
import { resolveHeadPolicy } from '../../../shared/head-policy.mjs';

const { createGitRepository } = useGitFixtures();

function baseWith(config) {
  return createGitRepository({
    'nitpicker.config.json': JSON.stringify(config),
    'src/a.ts': 'export {};\n',
  }).root;
}

function duplicateArguments(analyzer) {
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
    const bases = [
      { preset },
      { preset, duplicates: { skippedFolders: ['dist'] } },
      { preset, thresholds: { crapLimit: 12 } },
      { preset, thresholds: { crapLimit: 12 }, duplicates: { skippedFolders: ['dist'] } },
    ].map((config) =>
      resolve({
        baseProjectRoot: baseWith(config),
        headSnapshotRoot: baseWith({}),
        analyzers: headAnalyzers,
      }),
    );

    expect(bases.map(({ analyzers = headAnalyzers }) => analyzers.map(duplicateArguments))).toEqual(
      Array.from({ length: 4 }, () => headAnalyzers.map(duplicateArguments)),
    );
    expect(headAnalyzers.map(duplicateArguments)).toEqual(expected);
  });
});
