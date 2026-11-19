import path from 'node:path';
import { readHeadPolicy, readLayout } from '../../adapters/typed/head-policy.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import type { EnvironmentOptions, Environments } from './typed/environment-types.mts';
import { DEFAULT_TEST_RUNNER } from '../test-runner/runners.mjs';
import { projectTestRunner, type RunnerCommand } from '../test-runner/project-runner.mts';
import {
  loadedProjectMocha as untypedLoadedProjectMocha,
  mochaSetupEntries as untypedMochaSetupEntries,
} from '../test-runner/test-files/mocha-test-files.mjs';
import { projectConfigFile as untypedProjectConfigFile } from './config-files.mjs';
import {
  DEFAULT_ENVIRONMENT,
  TEST_ENVIRONMENT_RULE,
  TEST_ENVIRONMENTS_VARIABLE,
} from './environments.mjs';
import {
  globalDomEnvironments as untypedGlobalDomEnvironments,
  nodeSetupEntries as untypedNodeSetupEntries,
} from './global-dom/global-dom.mjs';
import { environmentsFromJestConfig as untypedEnvironmentsFromJestConfig } from './jest/jest-environment.mjs';
import {
  jestConfigFile as untypedJestConfigFile,
  readJestConfig as untypedReadJestConfig,
} from './jest/read-jest-config.mjs';
import { readViteConfig as untypedReadViteConfig } from './vite/vite-reader.mjs';

type EnvironmentNotice = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

type LoadRequest = {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly timeoutMs: number;
  readonly command: RunnerCommand;
};

type LoadOptions = EnvironmentOptions & {
  readonly runner?: string | undefined;
  readonly command?: RunnerCommand | undefined;
};

const projectConfigFile: (projectRoot: string) => string | undefined = untypedProjectConfigFile;
const loadedProjectMocha: (options: {
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly tokens: readonly string[];
}) => unknown = untypedLoadedProjectMocha;
const mochaSetupEntries: (loaded: unknown) => readonly string[] = untypedMochaSetupEntries;

function isEnvironments(value: unknown): value is Environments {
  return (
    typeof value === 'object' && value !== null && 'scopes' in value && Array.isArray(value.scopes)
  );
}

function environmentsOf(value: unknown): Environments {
  if (!isEnvironments(value)) {
    throw new TypeError('A test environment reader returned no scopes');
  }
  return value;
}

function failureOf(outcome: unknown): string {
  const failure = fieldOf(outcome, 'failure');
  return typeof failure === 'string' ? failure : 'unknown failure';
}

function globalDomEnvironments(projectRoot: string, entries: readonly string[]): Environments {
  return environmentsOf(
    Reflect.apply(untypedGlobalDomEnvironments, undefined, [projectRoot, entries]),
  );
}

function nodeSetupEntries(command: RunnerCommand): readonly string[] {
  return textsOf(Reflect.apply(untypedNodeSetupEntries, undefined, [command]));
}

export { TEST_ENVIRONMENT_RULE, TEST_ENVIRONMENTS_VARIABLE };
export const LINT_CONFIG = 'languages/typescript/preset/defaults/eslint.config.mjs';

const TIMEOUT_MS = 30_000;
const UNKNOWN: Environments = { environment: undefined, scopes: [] };
const WHOLE_PROJECT_GLOBS = new Set(['**', '**/*']);
const NO_COMMAND: RunnerCommand = { environment: {}, nodeArguments: [], arguments_: [] };

function unreadable(
  projectRoot: string,
  configFile: string,
  describe: (configPath: string) => string,
): Environments {
  const configPath = path.relative(projectRoot, configFile).split(path.sep).join('/');
  return { ...UNKNOWN, notice: { path: configPath, message: describe(configPath) } };
}

function loadJestEnvironments(request: LoadRequest): Environments {
  const { projectRoot, command } = request;
  const read: unknown = Reflect.apply(untypedReadJestConfig, undefined, [request]);
  const config = fieldOf(read, 'config');
  if (config !== undefined) {
    return environmentsOf(
      Reflect.apply(untypedEnvironmentsFromJestConfig, undefined, [config, projectRoot]),
    );
  }
  const configFile = textOf(
    Reflect.apply(untypedJestConfigFile, undefined, [projectRoot, command]),
  );
  return unreadable(projectRoot, path.resolve(projectRoot, configFile), (configPath) =>
    noticeFor(configPath, failureOf(read)),
  );
}

function loadMochaEnvironments({
  projectRoot,
  liveProjectRoot,
  command,
}: LoadRequest): Environments {
  const loaded = loadedProjectMocha({ projectRoot, liveProjectRoot, tokens: command.arguments_ });
  return globalDomEnvironments(projectRoot, mochaSetupEntries(loaded));
}

function loadNodeEnvironments({ projectRoot, command }: LoadRequest): Environments {
  return globalDomEnvironments(projectRoot, nodeSetupEntries(command));
}

function loadViteEnvironments({
  projectRoot,
  liveProjectRoot,
  timeoutMs,
}: LoadRequest): Environments {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) {
    return { ...UNKNOWN, environment: DEFAULT_ENVIRONMENT };
  }
  const outcome: unknown = Reflect.apply(untypedReadViteConfig, undefined, [
    {
      configFile,
      projectRoot,
      resolveRoots: [...new Set([projectRoot, liveProjectRoot])],
      timeoutMs,
    },
  ]);
  const result = fieldOf(outcome, 'result');
  return result === undefined
    ? unreadable(projectRoot, configFile, () => loadFailureNotice(failureOf(outcome)))
    : environmentsOf(fieldOf(result, 'environments'));
}

const LOADERS: Readonly<Record<string, (request: LoadRequest) => Environments>> = {
  jest: loadJestEnvironments,
  vitest: loadViteEnvironments,
  mocha: loadMochaEnvironments,
  node: loadNodeEnvironments,
};

export function loadTestEnvironments({
  projectRoot,
  liveProjectRoot = projectRoot,
  timeoutMs = TIMEOUT_MS,
  runner = DEFAULT_TEST_RUNNER,
  command = NO_COMMAND,
}: LoadOptions): Environments {
  const load = LOADERS[runner] ?? loadViteEnvironments;
  return load({ projectRoot, liveProjectRoot, timeoutMs, command });
}

function loadFailureNotice(reason: string): string {
  return `The DOM-environment check only uses per-file directives: ${reason.replace(/\.$/u, '')}.`;
}

function noticeFor(configPath: string, reason: string): string {
  return `The project's test config ${configPath} could not be read (${reason}), so the DOM-environment check only uses per-file directives.`;
}

function ruleIsExcepted(exceptions: readonly unknown[]): boolean {
  return exceptions.some(
    (exception) =>
      textOf(fieldOf(exception, 'rule')) === TEST_ENVIRONMENT_RULE &&
      textsOf(fieldOf(exception, 'paths')).some((glob) => WHOLE_PROJECT_GLOBS.has(glob)),
  );
}

export function testEnvironmentsFor(
  options: EnvironmentOptions & { readonly configRelativePath: string },
): Environments {
  const layout = readLayout();
  const policy = readHeadPolicy();
  const selected =
    options.configRelativePath === LINT_CONFIG &&
    !ruleIsExcepted(policy.exceptions) &&
    layout.projectCodeFiles(options.projectRoot).some((file) => layout.isRunnableTestFile(file));
  if (!selected) {
    return UNKNOWN;
  }
  const { runner, command } = projectTestRunner(options);
  return loadTestEnvironments({ ...options, runner, command });
}

export function testEnvironmentNotices({
  testEnvironments,
  analyzerName,
}: {
  readonly testEnvironments: { readonly notice?: Environments['notice'] };
  readonly analyzerName: string;
}): EnvironmentNotice[] {
  const notice = testEnvironments.notice;
  if (notice === undefined) {
    return [];
  }
  return [
    {
      tool: analyzerName,
      rule: TEST_ENVIRONMENT_RULE,
      path: notice.path,
      identity: 'test-config-unreadable',
      message: notice.message,
      classification: 'descriptive',
    },
  ];
}
