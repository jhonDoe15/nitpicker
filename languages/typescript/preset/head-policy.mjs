import { readHeadPolicyFile } from '../../../shared/head-policy.mjs';
import { isJavascriptPolicy } from '../../javascript/preset/javascript-preset.mjs';
import { excludedGlobs, resolveLayout, sourceRoots, testRoots } from './layout.mjs';

export {
  headPolicyEnvironment,
  resolveHeadPolicy,
  withHeadPolicyFile,
} from '../../../shared/head-policy.mjs';

export const defaultLayout = { sourceRoots, testRoots, excludedGlobs };

export function readHeadPolicy(environment = process.env) {
  const policy = readHeadPolicyFile(environment);
  return {
    exclude: policy.exclude ?? [],
    layout: { ...defaultLayout, ...policy.layout },
    exceptions: policy.exceptions ?? [],
    thresholds: policy.thresholds ?? {},
    preset: policy.preset,
  };
}

export function readLayout(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return {
    ...resolveLayout(policy.layout, policy.exclude, { javascript: isJavascriptPolicy(policy) }),
    entryPoints: policy.layout.entryPoints ?? [],
  };
}
