import type { TestOptions } from '../typed/runner-types.mts';

export function testOptions(fields: Partial<TestOptions>): TestOptions {
  return {
    analyzerName: 'coverage',
    kind: 'coverage',
    projectRoot: '',
    projectPolicyRoot: '',
    policyRoot: '',
    toolRoot: '',
    liveProjectRoot: '',
    snapshot: 'head',
    legacyInventory: '',
    crapScoreLimit: 0,
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    mutationScope: undefined,
    ...fields,
  };
}
