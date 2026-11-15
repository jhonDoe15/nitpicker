import { describe, expect, it } from 'vitest';
import { createBaseSetupResolver } from '../../command/policy-review/base-setup.mts';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';
import type { ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';
import { applyRunProfile } from '../profile.mts';

const { createGitRepository } = useGitFixtures();

function isProfiled(value: unknown): value is ProfiledAnalyzer {
  return (
    typeof fieldOf(value, 'name') === 'string' &&
    typeof fieldOf(value, 'createInvocation') === 'function'
  );
}

function languageAnalyzer(name: string): ProfiledAnalyzer & { readonly version: string } {
  return {
    name,
    version: '1',
    configurationHash: 'h',
    createInvocation: () => ({ command: 'node', args: ['java-runner.mjs'], cwd: '.' }),
  };
}

function baseSetup(profile: {
  readonly quick: boolean;
  readonly analyzerNames?: readonly string[];
}) {
  const { root } = createGitRepository({
    'nitpicker.config.json': '{ "preset": "java", "thresholds": { "fileLines": 500 } }\n',
  });
  const injectedAnalyzers = [languageAnalyzer('java'), languageAnalyzer('coverage')];
  const { analyzers } = applyRunProfile(injectedAnalyzers, profile);
  const resolve = createBaseSetupResolver({
    headConfig: { preset: 'java' },
    injectedAnalyzers,
    profile,
  });
  return listOf(
    fieldOf(
      resolve({
        baseProjectRoot: root,
        headSnapshotRoot: root,
        liveProjectRoot: root,
        moves: undefined,
        analyzers,
      }),
      'analyzers',
    ),
  ).filter(isProfiled);
}

describe('base analyzers rebuilt for a changed base config', () => {
  it('run the quick mode on the base when the run is quick', () => {
    const analyzers = baseSetup({ quick: true, analyzerNames: [] });

    expect(analyzers.map(({ name }) => name)).toEqual(['java']);
    expect(analyzers[0]?.quick).toBe(true);
    expect(analyzers[0]?.createInvocation({ snapshot: 'base' }).args.slice(-2)).toEqual([
      '--mode',
      'quick',
    ]);
  });

  it('stay the full analyzers on the base for a full run', () => {
    const analyzers = baseSetup({ quick: false });

    expect(analyzers.map(({ name }) => name)).toEqual(['java', 'coverage']);
    expect(analyzers[0]?.quick).toBeUndefined();
  });
});
