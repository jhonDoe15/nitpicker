export const atomicUpdateRules = {
  'require-atomic-updates': ['error', { allowProperties: false }],
};

export function atomicUpdateConfigFor(layout) {
  return {
    files: [...layout.sourceGlobs, ...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
    rules: atomicUpdateRules,
  };
}
