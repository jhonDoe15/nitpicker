import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { readHeadPolicy } from '../head-policy.mjs';
import { testRunnerFor } from './detect-runner.mjs';
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
