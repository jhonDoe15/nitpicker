import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { readHeadPolicy } from '../head-policy.mjs';
import { detectTestRunner, testRunnerFor } from './detect-runner.mjs';
import { runnerCommand } from './script-command.mjs';

const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [], precedingCommands: [] };

function detectionRoot({ projectRoot, liveProjectRoot }) {
  return liveProjectRoot === undefined || liveProjectRoot === PACKAGE_ROOT
    ? projectRoot
    : liveProjectRoot;
}

export function projectTestRunner(options) {
  const detected = testRunnerFor(detectionRoot(options), readHeadPolicy().tools.tests?.runner);
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
  return recordedTestRunner(policy) ?? detectTestRunner(projectRoot).runner;
}
