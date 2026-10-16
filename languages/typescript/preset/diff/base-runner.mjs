import { runnerInstallation } from '../../adapters/test-runners/runner-tools.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { runnerDetection } from '../test-runner/detect-runner.mjs';
import { recordedTestRunner } from '../test-runner/project-runner.mjs';
import { RUNNER_NAMES, RUNNER_PACKAGES } from '../test-runner/runners.mjs';

const BASE_TEST_ANALYZERS = new Set(['coverage', 'crap']);

function baseRunnerPolicy(setup, headPolicy) {
  const own = setup.headPolicy;
  if (own === undefined) {
    return headPolicy;
  }
  return {
    ...own,
    tools: { ...own.tools, tests: { ...headPolicy.tools.tests, ...own.tools?.tests } },
  };
}

function baseRunnerFor(policy, baseProjectRoot) {
  return (
    policy.tools.tests.runner ??
    runnerDetection(baseProjectRoot, resolveLayoutFor(policy)).runner ??
    policy.tools.tests.detectedRunner
  );
}

function withSnapshotRunner(policy, runner) {
  return {
    ...policy,
    tools: { ...policy.tools, tests: { ...policy.tools.tests, snapshotRunner: runner } },
  };
}

function missingRunnerNotice(baseRunner, headRunner) {
  return (
    `The base runs its tests with ${RUNNER_NAMES[baseRunner]} and the head with ` +
    `${RUNNER_NAMES[headRunner]}, but ${RUNNER_PACKAGES[baseRunner]} is not installed, ` +
    'so coverage and CRAP are not compared on this change.'
  );
}

function withoutBaseTests(setup, { analyzers, policy }) {
  return {
    ...setup,
    headPolicy: policy,
    analyzers: (setup.analyzers ?? analyzers).filter(({ name }) => !BASE_TEST_ANALYZERS.has(name)),
  };
}

export function withBaseTestRunner(setup, context) {
  const { headPolicy, baseProjectRoot, liveProjectRoot, warn } = context;
  if (headPolicy?.tools?.tests === undefined) {
    return setup;
  }
  const policy = baseRunnerPolicy(setup, headPolicy);
  const baseRunner = baseRunnerFor(policy, baseProjectRoot);
  const headRunner = recordedTestRunner(headPolicy);
  if (baseRunner === headRunner) {
    return setup.headPolicy === undefined ? setup : { ...setup, headPolicy: policy };
  }
  if (runnerInstallation(baseRunner, liveProjectRoot).installed) {
    return { ...setup, headPolicy: withSnapshotRunner(policy, baseRunner) };
  }
  warn(missingRunnerNotice(baseRunner, headRunner));
  return withoutBaseTests(setup, { analyzers: context.analyzers, policy });
}
