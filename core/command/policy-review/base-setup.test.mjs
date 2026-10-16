import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { createBaseSetupResolver } from './base-setup.mjs';

const { createGitRepository } = useGitFixtures();

describe('createBaseSetupResolver', () => {
  it('measures the base with the stricter threshold, so a tightening keeps legacy findings old', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': '{ "thresholds": { "fileLines": 500 } }\n',
      'src/a.ts': 'export {};\n',
    });
    const resolve = createBaseSetupResolver({ headConfig: {}, injectedAnalyzers: [] });

    const setup = resolve({ baseProjectRoot: root, headSnapshotRoot: root, analyzers: [] });

    expect(setup.headPolicy.thresholds).toEqual({ fileLines: 300 });
    expect(setup.policyChanges).toEqual(['threshold fileLines lowered from 500 to 300']);
    expect(setup.policyLoosenings).toEqual([]);
  });
});
