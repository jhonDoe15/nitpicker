import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../preset/head-policy.mjs';

const REPLACED_OPTIONS_REPORT = path.join(
  import.meta.dirname,
  '../../preset/eslint-project/report.mjs',
);
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
    const reportFile = path.join(path.dirname(policyFile), 'replaced-options.json');
    const result = spawnSync(
      process.execPath,
      [
        REPLACED_OPTIONS_REPORT,
        path.join(projectRoot, policy.tools.eslint.projectConfigFile),
        reportFile,
        policyFile,
        projectRoot,
      ],
      { cwd: projectRoot, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
    );
    return result.status === 0 && existsSync(reportFile)
      ? JSON.parse(readFileSync(reportFile, 'utf8'))
      : { error: (result.stderr || result.error?.message || 'no report').trim() };
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
