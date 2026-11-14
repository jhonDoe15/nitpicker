import path from 'node:path';
import { shellCommands } from '../../../../../shared/started-files/shell-commands.mjs';

const RUNNERS = new Set([
  'node',
  'nodejs',
  'tsx',
  'ts-node',
  'ts-node-esm',
  'bun',
  'nodemon',
  'babel-node',
  'esno',
  'jiti',
  'vite-node',
]);
const SUBCOMMANDS = new Set(['run', 'watch', 'exec', 'x']);
const LOADER_OPTIONS = new Set([
  '--import',
  '--loader',
  '--experimental-loader',
  '--require',
  '-r',
  '--test-reporter',
]);
const VALUE_OPTIONS = new Set([
  '--conditions',
  '-C',
  '--env-file',
  '--eval',
  '-e',
  '--print',
  '-p',
  '--inspect-port',
  '--stack-size',
  '--tsconfig',
  '--test-reporter-destination',
  '--test-name-pattern',
]);
const CODE_FILE = /\.[cm]?[jt]sx?$/u;
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;
const UNRESOLVED = /[$*{}`()<>]/u;

function runnerName(token) {
  return token.slice(token.lastIndexOf('/') + 1);
}

function normalized(candidate, directory) {
  if (candidate === undefined || UNRESOLVED.test(candidate) || !CODE_FILE.test(candidate)) {
    return undefined;
  }
  return path.posix.normalize(path.posix.join(directory, candidate));
}

function loaderValue(token, next) {
  const separator = token.indexOf('=');
  if (separator > 0 && LOADER_OPTIONS.has(token.slice(0, separator))) {
    return { value: token.slice(separator + 1), consumed: 0 };
  }
  return LOADER_OPTIONS.has(token) ? { value: next, consumed: 1 } : undefined;
}

function isOptionValue(tokens, index) {
  return index > 0 && tokens[index - 1].startsWith('-') && !tokens[index - 1].includes('=');
}

function isSkippedToken(tokens, index) {
  const token = tokens[index];
  return (
    token.startsWith('-') ||
    SUBCOMMANDS.has(token) ||
    (isOptionValue(tokens, index) && !CODE_FILE.test(token))
  );
}

function listOf(file) {
  return file === undefined ? [] : [file];
}

function scanToken(tokens, index, directory) {
  const token = tokens[index];
  const loader = loaderValue(token, tokens[index + 1]);
  if (loader !== undefined) {
    const files = listOf(normalized(loader.value, directory));
    return { entryPoints: files, defaultExports: files, skip: loader.consumed, stop: false };
  }
  const skip = VALUE_OPTIONS.has(token) ? 1 : 0;
  if (skip > 0 || isSkippedToken(tokens, index)) {
    return { entryPoints: [], defaultExports: [], skip, stop: false };
  }
  return {
    entryPoints: listOf(normalized(token, directory)),
    defaultExports: [],
    skip,
    stop: true,
  };
}

function scanRunnerArguments(tokens, directory) {
  const found = { entryPoints: [], defaultExports: [] };
  let skip = 0;
  for (const index of tokens.keys()) {
    if (skip > 0) {
      skip -= 1;
      continue;
    }
    const step = scanToken(tokens, index, directory);
    found.entryPoints.push(...step.entryPoints);
    found.defaultExports.push(...step.defaultExports);
    skip = step.skip;
    if (step.stop) {
      break;
    }
  }
  return found;
}

function scanSegment({ tokens: all, directory }) {
  const tokens = all.filter((token) => !ASSIGNMENT.test(token));
  const start = tokens.findIndex((token) => RUNNERS.has(runnerName(token)));
  return start < 0
    ? { entryPoints: [], defaultExports: [] }
    : scanRunnerArguments(tokens.slice(start + 1), directory);
}

export function filesStartedByCommand(command, directory = '') {
  const results = shellCommands(command, directory).map((segment) => scanSegment(segment));
  return {
    entryPoints: results.flatMap((result) => result.entryPoints),
    defaultExports: results.flatMap((result) => result.defaultExports),
  };
}
