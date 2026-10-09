import { readHeadPolicyFile } from '../shared/head-policy.mjs';
import { excludedGlobs, resolveLayout, sourceRoots, testRoots } from './layout.mjs';

// The file format, writer and environment variable are language-neutral and live in
// shared/head-policy.mjs; this module adds the TypeScript preset's layout defaults.
export {
  HEAD_POLICY_ENV,
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../shared/head-policy.mjs';

/** Layout used when the config file does not override it. */
export const defaultLayout = { sourceRoots, testRoots, excludedGlobs };

/**
 * The one reader for runners and package-owned child configs. Without the variable (a runner
 * started by hand) the defaults apply.
 */
export function readHeadPolicy(environment = process.env) {
  const policy = readHeadPolicyFile(environment);
  return {
    exclude: policy.exclude ?? [],
    layout: { ...defaultLayout, ...policy.layout },
    exceptions: policy.exceptions ?? [],
    thresholds: policy.thresholds ?? {},
  };
}

/**
 * The layout every runner and package-owned config works from: the head policy's source and test
 * roots plus its `exclude` globs, resolved once into globs, patterns and predicates.
 */
export function readLayout(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return resolveLayout(policy.layout, policy.exclude);
}
