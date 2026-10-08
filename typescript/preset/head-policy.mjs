import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { excludedGlobs, sourceRoots, testRoots } from './layout.mjs';

export const HEAD_POLICY_ENV = 'NITPICKER_POLICY';

/** Layout used when the config file does not override it. */
export const defaultLayout = { sourceRoots, testRoots, excludedGlobs };

/** The validated config reduced to the three keys that change what runners analyze. */
export function resolveHeadPolicy(config = {}) {
  return {
    exclude: config.exclude ?? [],
    layout: config.layout ?? {},
    thresholds: config.thresholds ?? {},
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
 * The one reader for runners and package-owned child configs. Without the variable (a runner
 * started by hand) the defaults apply. A variable that points at an unreadable or malformed file
 * is an error, never a silent fallback to a weaker policy.
 */
export function readHeadPolicy(environment = process.env) {
  const policyFile = environment[HEAD_POLICY_ENV];
  const policy =
    policyFile === undefined || policyFile === ''
      ? {}
      : parsePolicy(policyFile, readFileSync(policyFile, 'utf8'));
  return {
    exclude: policy.exclude ?? [],
    layout: { ...defaultLayout, ...policy.layout },
    thresholds: policy.thresholds ?? {},
  };
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
