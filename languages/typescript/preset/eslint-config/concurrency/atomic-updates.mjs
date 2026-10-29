import { nitpickerRules } from '../../eslint-plugin/index.mjs';

const atomicUpdateRules = {
  'nitpicker/require-atomic-updates': ['error', { allowProperties: false }],
};

export function atomicUpdateConfigFor(layout) {
  return {
    files: [...layout.sourceGlobs, ...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
    plugins: { nitpicker: nitpickerRules },
    rules: atomicUpdateRules,
  };
}
