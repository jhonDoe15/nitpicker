export const HOST_CI_OUTPUT_VARIABLES = [
  'GITHUB_STEP_SUMMARY',
  'GITHUB_OUTPUT',
  'GITHUB_ENV',
  'GITHUB_PATH',
  'GITHUB_STATE',
];

const HOST_CI_OUTPUTS = new Set(HOST_CI_OUTPUT_VARIABLES);

export function withoutHostCiOutputs(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !HOST_CI_OUTPUTS.has(name)),
  );
}
