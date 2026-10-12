// The head policy: the config values that change what analyzers report (`exclude`, `layout`,
// `exceptions`, `thresholds` and, when set, `react` and `tools`), written once to a file outside
// both snapshots so base and head runs see the same policy. The file format and its reader are
// language-neutral; the TypeScript preset adds its layout defaults in
// `languages/typescript/preset/head-policy.mjs`.
//
// Language-neutral: no imports from `core/`, `languages/` or tool packages.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const HEAD_POLICY_ENV = 'NITPICKER_POLICY';

/** The validated config reduced to the keys that change what runners analyze. */
export function resolveHeadPolicy(config = {}) {
  return {
    exclude: config.exclude ?? [],
    layout: config.layout ?? {},
    exceptions: config.exceptions ?? [],
    thresholds: config.thresholds ?? {},
    ...(config.react === undefined ? {} : { react: config.react }),
    ...(config.tools === undefined ? {} : { tools: config.tools }),
  };
}

/**
 * Writes the head policy as one JSON file outside both snapshots and runs `operation` with its
 * path. Base and head runs receive the same file, so a base tree cannot choose its own policy.
 */
export function withHeadPolicyFile(policy, operation) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-policy-'));
  const policyFile = path.join(directory, 'policy.json');
  try {
    writeFileSync(policyFile, `${JSON.stringify(policy)}\n`);
    return operation(policyFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Environment entry that hands the policy file to every runner and child config. */
export function headPolicyEnvironment(policyFile) {
  return { [HEAD_POLICY_ENV]: policyFile };
}

/**
 * The policy file's content as written, or `{}` when no file is named (a runner started by hand).
 * A variable that points at an unreadable or malformed file is an error, never a silent fallback
 * to a weaker policy.
 */
export function readHeadPolicyFile(environment = process.env) {
  const policyFile = environment[HEAD_POLICY_ENV];
  return policyFile === undefined || policyFile === ''
    ? {}
    : parsePolicy(policyFile, readFileSync(policyFile, 'utf8'));
}

function parsePolicy(policyFile, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${HEAD_POLICY_ENV} file ${policyFile} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
