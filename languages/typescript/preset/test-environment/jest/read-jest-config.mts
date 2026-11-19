import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fieldOf, messageOf, parseJson } from '../../../../../shared/values/readers.mts';
import type { TestCommandView } from '../typed/environment-types.mts';
import { jestArguments, jestTool } from './jest-launcher.mts';

const CONFIG_NAMES = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'].map(
  (extension) => `jest.config.${extension}`,
);
const CONFIG_OPTIONS = new Set(['-c', '--config']);
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_START = '{\n  "configs"';
type JestLaunch = {
  readonly binary?: string | undefined;
  readonly launch?: ReturnType<typeof jestTool>;
  readonly failure?: string;
};

type JestRead = { readonly config?: unknown; readonly failure?: string | undefined };

const NO_COMMAND: TestCommandView = { environment: {}, nodeArguments: [], arguments_: [] };

function configArgument(tokens: readonly string[]): string | undefined {
  const index = tokens.findIndex((token) => CONFIG_OPTIONS.has(token.split('=')[0] ?? ''));
  if (index === -1) {
    return undefined;
  }
  const [, ...value] = (tokens[index] ?? '').split('=');
  return value.length > 0 ? value.join('=') : tokens[index + 1];
}

export function jestConfigFile(projectRoot: string, command: TestCommandView = NO_COMMAND): string {
  const configured = configArgument(command.arguments_);
  if (configured !== undefined && !configured.trimStart().startsWith('{')) {
    return path.normalize(configured);
  }
  const present = new Set(readdirSync(projectRoot));
  const found = CONFIG_NAMES.find((name) => present.has(name));
  return found ?? 'package.json';
}

function jestBinary(
  projectRoot: string,
  liveProjectRoot: string,
): { binary?: string; failure?: string } {
  const failures: string[] = [];
  for (const root of new Set([liveProjectRoot, projectRoot])) {
    try {
      const manifest = createRequire(path.join(root, 'package.json')).resolve('jest/package.json');
      return { binary: path.join(path.dirname(manifest), 'bin/jest.js') };
    } catch (error) {
      failures.push(messageOf(error));
    }
  }
  return { failure: `jest could not be resolved from the project (${failures.join('; ')})` };
}

function jestLaunch(
  {
    projectRoot,
    liveProjectRoot,
  }: { readonly projectRoot: string; readonly liveProjectRoot: string },
  launcher: string | undefined,
): JestLaunch {
  if (launcher === undefined) {
    return { ...jestBinary(projectRoot, liveProjectRoot), launch: jestTool({ liveProjectRoot }) };
  }
  try {
    const launch = jestTool({ liveProjectRoot }, launcher);
    return { binary: launch.tool.absoluteToolPath, launch };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

function errorSummary(result: SpawnSyncReturns<string>): string {
  const lines = result.stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? '' : `: ${lines.slice(0, 2).join(' ')}`;
}

function parsedConfig(result: SpawnSyncReturns<string>): JestRead {
  const start = result.stdout.lastIndexOf(OUTPUT_START);
  if (start === -1) {
    return {
      failure: `jest --showConfig exited with code ${String(result.status)}${errorSummary(result)}`,
    };
  }
  try {
    return { config: parseJson(result.stdout.slice(start)) };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

export function readJestConfig({
  projectRoot,
  liveProjectRoot = projectRoot,
  timeoutMs,
  command = NO_COMMAND,
  parentEnvironment = process.env,
}: {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly command?: TestCommandView | undefined;
  readonly parentEnvironment?: NodeJS.ProcessEnv | undefined;
}): JestRead {
  const { binary, launch, failure } = jestLaunch(
    { projectRoot, liveProjectRoot },
    command.launcher,
  );
  if (binary === undefined || launch === undefined) {
    return { failure };
  }
  const shown = jestArguments(command, ['--showConfig', '--no-watchman'], launch);
  const result = spawnSync(process.execPath, [...command.nodeArguments, binary, ...shown], {
    cwd: projectRoot,
    env: { ...parentEnvironment, ...command.environment },
    encoding: 'utf8',
    input: '',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  if (result.error !== undefined && fieldOf(result.error, 'code') === 'ETIMEDOUT') {
    return { failure: `it did not finish within ${String(timeoutMs)} ms` };
  }
  return result.error === undefined ? parsedConfig(result) : { failure: result.error.message };
}
