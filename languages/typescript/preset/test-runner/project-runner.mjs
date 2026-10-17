import { readHeadPolicy } from '../head-policy.mjs';
import { detectTestRunner, testRunnerFor } from './detect-runner.mjs';
import { recordedTestRunner } from './runner-vocabulary.mjs';
import { runnerCommand } from './script-command.mjs';

const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [], precedingCommands: [] };

function detectionRoot({ projectRoot, runnerProjectRoot }) {
  return runnerProjectRoot ?? projectRoot;
}

export function projectTestRunner(options) {
  const detected = testRunnerFor(detectionRoot(options), readHeadPolicy().tools.tests?.runner);
  return {
    ...detected,
    command: runnerCommand(detected.command, detected.runner) ?? NO_COMMAND,
  };
}

export function policyTestRunner(policy, projectRoot) {
  return recordedTestRunner(policy) ?? detectTestRunner(projectRoot).runner;
}
