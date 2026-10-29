import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../../preset/head-policy.mjs';

const REPLACED_OPTIONS_CLI = path.join(import.meta.dirname, 'replaced-options-cli.mjs');
const MAX_OUTPUT_BYTES = 1024 * 1024;

function reviewedPolicy(config, projectRoot) {
  try {
    return { policy: resolveHeadPolicy(config, projectRoot) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function spawned(policy, projectRoot) {
  return withHeadPolicyFile(policy, (policyFile) => {
    const result = spawnSync(
      process.execPath,
      [REPLACED_OPTIONS_CLI, path.join(projectRoot, policy.tools.eslint.projectConfigFile)],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        env: {
          ...process.env,
          ...headPolicyEnvironment(policyFile),
          NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
        },
      },
    );
    return result.status === 0 && result.stdout.startsWith('{')
      ? JSON.parse(result.stdout)
      : { error: (result.stderr || result.error?.message || 'no output').trim() };
  });
}

export function replacedEslintOptions(config, projectRoot) {
  const { policy, error } = reviewedPolicy(config, projectRoot);
  if (error !== undefined) {
    return { error };
  }
  return policy.tools?.eslint?.projectConfigFile === undefined
    ? { rules: [] }
    : spawned(policy, projectRoot);
}
