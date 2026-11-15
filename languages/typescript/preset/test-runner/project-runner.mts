import {
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
} from '../head-policy.mjs';
import { testRunnerFor as untypedTestRunnerFor } from './detect-runner.mjs';
import { runnerCommand as untypedRunnerCommand } from './script-command.mjs';

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

type TestsPolicy = {
  readonly runner?: string | undefined;
  readonly runnerAmbiguity?: unknown;
  readonly detectedRunner?: string | undefined;
  readonly snapshotRunner?: string | undefined;
};

const readHeadPolicy: () => { readonly tools: { readonly tests?: TestsPolicy } } =
  untypedReadHeadPolicy;
const readLayout: () => unknown = untypedReadLayout;
const testRunnerFor: (
  root: string,
  preferred: string | undefined,
  layout?: unknown,
) => DetectedRunner = untypedTestRunnerFor;
const runnerCommand: (command: unknown, runner: string) => RunnerCommand | undefined =
  untypedRunnerCommand;

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
  const chosen = tests.runnerAmbiguity === undefined ? tests.runner : tests.detectedRunner;
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
