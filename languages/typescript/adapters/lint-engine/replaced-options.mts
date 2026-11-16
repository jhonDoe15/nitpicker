import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  resolveHeadPolicy as untypedResolveHeadPolicy,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from '../../preset/head-policy.mjs';
import { fieldOf, messageOf, parseJson, textsOf } from '../../../../shared/values/readers.mts';
import { TOOL_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mjs';

const REPLACED_OPTIONS_REPORT = path.join(
  import.meta.dirname,
  '../../preset/eslint-project/report.mjs',
);
const MAX_OUTPUT_BYTES = 1024 * 1024;

type Policy = { readonly tools?: { readonly eslint?: { readonly projectConfigFile?: string } } };
type Reviewed =
  | { readonly policy: Policy; readonly error?: undefined }
  | { readonly error: string; readonly policy?: undefined };
type Replaced = { readonly rules: string[] } | { readonly error: string };

const resolveHeadPolicy: (config: object, projectRoot: string) => Policy = untypedResolveHeadPolicy;
const withHeadPolicyFile: <Result>(
  policy: Policy,
  operation: (policyFile: string) => Result,
) => Result = untypedWithHeadPolicyFile;

function replacedFrom(report: unknown): Replaced {
  const error = fieldOf(report, 'error');
  return typeof error === 'string' ? { error } : { rules: textsOf(fieldOf(report, 'rules')) };
}

function reviewedPolicy(config: object, projectRoot: string): Reviewed {
  try {
    return { policy: resolveHeadPolicy(config, projectRoot) };
  } catch (error) {
    return { error: messageOf(error) };
  }
}

function spawned(policy: Policy, projectConfigFile: string, projectRoot: string): Replaced {
  return withHeadPolicyFile(policy, (policyFile) => {
    const reportFile = path.join(path.dirname(policyFile), 'replaced-options.json');
    const result = spawnSync(
      process.execPath,
      [
        REPLACED_OPTIONS_REPORT,
        path.join(projectRoot, projectConfigFile),
        reportFile,
        policyFile,
        projectRoot,
      ],
      { cwd: projectRoot, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: TOOL_TIMEOUT_MS },
    );
    return result.status === 0 && existsSync(reportFile)
      ? replacedFrom(parseJson(readFileSync(reportFile, 'utf8')))
      : { error: (result.stderr || result.error?.message || 'no report').trim() };
  });
}

export function replacedEslintOptions(config: object, projectRoot: string): Replaced {
  const { policy, error } = reviewedPolicy(config, projectRoot);
  if (error !== undefined) {
    return { error };
  }
  const projectConfigFile = policy.tools?.eslint?.projectConfigFile;
  return projectConfigFile === undefined
    ? { rules: [] }
    : spawned(policy, projectConfigFile, projectRoot);
}
