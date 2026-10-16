import { readHeadPolicy } from '../head-policy.mjs';
import { testRunnerFor } from './detect-runner.mjs';
import { runnerCommand } from './script-command.mjs';

const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [] };

export function projectTestRunner(projectRoot) {
  const detected = testRunnerFor(projectRoot, readHeadPolicy().tools.tests?.runner);
  return {
    ...detected,
    command: runnerCommand(detected.command, detected.runner) ?? NO_COMMAND,
  };
}
