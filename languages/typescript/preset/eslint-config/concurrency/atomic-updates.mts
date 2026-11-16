import { nitpickerRules } from '../../eslint-plugin/index.mts';
import type { ScopeLayout } from '../typed/config-types.mts';

const atomicUpdateRules = {
  'nitpicker/require-atomic-updates': ['error', { allowProperties: false }],
};

export function atomicUpdateConfigFor(layout: ScopeLayout): object {
  return {
    files: [...layout.sourceGlobs, ...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
    plugins: { nitpicker: nitpickerRules },
    rules: atomicUpdateRules,
  };
}
