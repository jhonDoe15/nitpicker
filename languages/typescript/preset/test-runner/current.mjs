import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { configuredTestRunner } from './runners.mjs';
import { resolveTestRunner } from './resolve.mjs';

const resolved = new Map();

export function testRunnerFor(projectRoot, environment = process.env) {
  const policy = readHeadPolicy(environment);
  const configured = configuredTestRunner(policy);
  const key = `${projectRoot}\0${configured ?? ''}\0${environment.NITPICKER_POLICY ?? ''}`;
  if (!resolved.has(key)) {
    resolved.set(
      key,
      resolveTestRunner({ projectRoot, layout: readLayout(environment), configured }).runner,
    );
  }
  return resolved.get(key);
}

export function analyzedTestRunner(environment = process.env) {
  return testRunnerFor(
    environment.NITPICKER_DIFF_ESLINT_PROJECT_ROOT ?? process.cwd(),
    environment,
  );
}
