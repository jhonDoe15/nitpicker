import { describe, expect, it, vi } from 'vitest';
import { withEngineLint } from './engine-pass.mts';

vi.mock('../../../preset/eslint-plugin/engine/engine-requests.mts', () => ({
  engineRuleName: (ruleId: string) => ruleId,
  engineSettings: 'not a function',
  runsOnEngine: undefined,
  isTypedOnEngine: undefined,
}));

describe('the engine requests module', () => {
  it('stops the engine pass when the module does not export every request', async () => {
    const pass = {
      plan: {
        groups: [],
        noInlineConfig: [],
        typedPluginRules: [],
        ruleMessages: {},
        nativeRules: [],
      },
      projectRoot: process.cwd(),
      projectConfigPath: undefined,
      environment: {},
      timeoutMs: undefined,
    };

    await expect(withEngineLint(pass, () => Promise.resolve())).rejects.toThrow(
      'does not export the engine requests',
    );
  });
});
