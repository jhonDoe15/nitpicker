const HOST_CI_OUTPUT_VARIABLES = new Set([
  'GITHUB_STEP_SUMMARY',
  'GITHUB_OUTPUT',
  'GITHUB_ENV',
  'GITHUB_PATH',
  'GITHUB_STATE',
]);

export function withoutHostCiOutputs(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !HOST_CI_OUTPUT_VARIABLES.has(name)),
  );
}
