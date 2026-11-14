import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { readHeadPolicy as untypedReadHeadPolicy } from '../head-policy.mjs';
import { testRunnerFor as untypedTestRunnerFor } from './detect-runner.mjs';
import { runnerCommand as untypedRunnerCommand } from './script-command.mjs';

type ProjectRunnerOptions = {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
};

type DetectedRunner = {
  readonly runner: unknown;
  readonly evidence: unknown;
  readonly command?: unknown;
};

const readHeadPolicy: () => {
  readonly tools: { readonly tests?: { readonly runner?: string | undefined } };
} = untypedReadHeadPolicy;
const testRunnerFor: (root: string, preferred: string | undefined) => DetectedRunner =
  untypedTestRunnerFor;
const runnerCommand: (command: unknown, runner: unknown) => object | undefined =
  untypedRunnerCommand;

const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [], precedingCommands: [] };

function detectionRoot({ projectRoot, liveProjectRoot }: ProjectRunnerOptions): string {
  return liveProjectRoot === undefined || liveProjectRoot === PACKAGE_ROOT
    ? projectRoot
    : liveProjectRoot;
}

export function projectTestRunner(options: ProjectRunnerOptions): DetectedRunner {
  const detected = testRunnerFor(detectionRoot(options), readHeadPolicy().tools.tests?.runner);
  return {
    ...detected,
    command: runnerCommand(detected.command, detected.runner) ?? NO_COMMAND,
  };
}
