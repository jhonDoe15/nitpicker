import { readHeadPolicy, readLayout as untypedReadLayout } from '../head-policy.mts';
import { testRunnerFor } from './detect-runner.mts';
import { runnerCommand } from './script-command.mts';
import type { DetectionLayout } from './typed/command-types.mts';

type ProjectRunnerOptions = {
  readonly projectRoot: string;
  readonly runnerProjectRoot?: string | undefined;
};

export type RunnerCommand = {
  readonly environment: Readonly<Record<string, string>>;
  readonly nodeArguments: readonly string[];
  readonly arguments_: readonly string[];
  readonly precedingCommands?: readonly string[];
  readonly launcher?: string;
};

type DetectedRunner = {
  readonly runner: string;
  readonly evidence: unknown;
  readonly command?: unknown;
};

type ProjectRunner = DetectedRunner & { readonly command: RunnerCommand };

const readLayout: () => DetectionLayout = untypedReadLayout;

const NO_COMMAND: RunnerCommand = {
  environment: {},
  nodeArguments: [],
  arguments_: [],
  precedingCommands: [],
};

function detectionRoot({ projectRoot, runnerProjectRoot }: ProjectRunnerOptions): string {
  return runnerProjectRoot ?? projectRoot;
}

function snapshotTestRunner(options: ProjectRunnerOptions): DetectedRunner {
  const tests = readHeadPolicy().tools.tests ?? {};
  const chosen = tests['runnerAmbiguity'] === undefined ? tests.runner : tests.detectedRunner;
  return tests.snapshotRunner === undefined
    ? testRunnerFor(detectionRoot(options), chosen, readLayout())
    : testRunnerFor(options.projectRoot, tests.snapshotRunner);
}

export function projectTestRunner(options: ProjectRunnerOptions): ProjectRunner {
  const detected = snapshotTestRunner(options);
  return {
    ...detected,
    command: runnerCommand(detected.command, detected.runner) ?? NO_COMMAND,
  };
}
