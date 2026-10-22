import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { jestArguments } from '../../../adapters/test-runners/jest/jest.mjs';
import { jestTool } from '../../../adapters/test-runners/jest/jest-launcher.mjs';

const CONFIG_NAMES = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'].map(
  (extension) => `jest.config.${extension}`,
);
const CONFIG_OPTIONS = new Set(['-c', '--config']);
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_START = '{\n  "configs"';
const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [] };

function configArgument(tokens) {
  const index = tokens.findIndex((token) => CONFIG_OPTIONS.has(token.split('=')[0]));
  if (index === -1) {
    return undefined;
  }
  const [, ...value] = tokens[index].split('=');
  return value.length > 0 ? value.join('=') : tokens[index + 1];
}

export function jestConfigFile(projectRoot, command = NO_COMMAND) {
  const configured = configArgument(command.arguments_);
  if (configured !== undefined && !configured.trimStart().startsWith('{')) {
    return path.normalize(configured);
  }
  const present = new Set(readdirSync(projectRoot));
  const found = CONFIG_NAMES.find((name) => present.has(name));
  return found ?? 'package.json';
}

function jestBinary(projectRoot, liveProjectRoot) {
  const failures = [];
  for (const root of new Set([liveProjectRoot, projectRoot])) {
    try {
      const manifest = createRequire(path.join(root, 'package.json')).resolve('jest/package.json');
      return { binary: path.join(path.dirname(manifest), 'bin/jest.js') };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { failure: `jest could not be resolved from the project (${failures.join('; ')})` };
}

function jestLaunch({ projectRoot, liveProjectRoot }, launcher) {
  if (launcher === undefined) {
    return { ...jestBinary(projectRoot, liveProjectRoot), launch: jestTool({}) };
  }
  try {
    const launch = jestTool({ liveProjectRoot }, launcher);
    return { binary: launch.tool.absoluteToolPath, launch };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
}

function errorSummary(result) {
  const lines = result.stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? '' : `: ${lines.slice(0, 2).join(' ')}`;
}

function parsedConfig(result) {
  const start = result.stdout.lastIndexOf(OUTPUT_START);
  if (start === -1) {
    return {
      failure: `jest --showConfig exited with code ${String(result.status)}${errorSummary(result)}`,
    };
  }
  try {
    return { config: JSON.parse(result.stdout.slice(start)) };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
}

export function readJestConfig({
  projectRoot,
  liveProjectRoot = projectRoot,
  timeoutMs,
  command = NO_COMMAND,
  parentEnvironment = process.env,
}) {
  const { binary, launch, failure } = jestLaunch(
    { projectRoot, liveProjectRoot },
    command.launcher,
  );
  if (binary === undefined) {
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
  if (result.error?.code === 'ETIMEDOUT') {
    return { failure: `it did not finish within ${String(timeoutMs)} ms` };
  }
  return result.error === undefined ? parsedConfig(result) : { failure: result.error.message };
}
