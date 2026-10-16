import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { readHeadPolicy, readLayout } from '../head-policy.mjs';
import { runnerDetection, testRunnerFor } from './detect-runner.mjs';
import { DEFAULT_TEST_RUNNER } from './runners.mjs';
import { runnerCommand } from './script-command.mjs';

const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [], precedingCommands: [] };

function detectionRoot({ projectRoot, liveProjectRoot }) {
  return liveProjectRoot === undefined || liveProjectRoot === PACKAGE_ROOT
    ? projectRoot
    : liveProjectRoot;
}

function snapshotTestRunner(options) {
  const tests = readHeadPolicy().tools.tests ?? {};
  return tests.snapshotRunner === undefined
    ? testRunnerFor(detectionRoot(options), tests.runner, readLayout())
    : testRunnerFor(options.projectRoot, tests.snapshotRunner);
}

export function projectTestRunner(options) {
  const detected = snapshotTestRunner(options);
  return {
    ...detected,
    command: runnerCommand(detected.command, detected.runner) ?? NO_COMMAND,
  };
}

export function recordedTestRunner(policy) {
  const tests = policy.tools?.tests;
  return tests?.runner ?? tests?.detectedRunner;
}

export function policyTestRunner(policy, projectRoot) {
  return recordedTestRunner(policy) ?? runnerDetection(projectRoot).runner ?? DEFAULT_TEST_RUNNER;
}
