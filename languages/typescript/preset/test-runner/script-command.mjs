import { NODE_TEST_OPTIONS_NITPICKER_SETS, TEST_RUNNERS } from './runners.mjs';

const ENV_ASSIGNMENT = /^(?<name>[A-Za-z_]\w*)=(?<value>.*)$/su;
const ENV_WRAPPERS = new Set(['cross-env', 'env']);
const BINARY_EXTENSION = /\.(?:[cm]?js|cmd)$/u;

const NODE_WRAPPER_ARGUMENTS = { node: [], tsx: ['--import', 'tsx'] };
const MOCHA_BINARIES = new Set(['mocha', '_mocha', 'ts-mocha']);
const JEST_LAUNCHERS = new Set(['react-scripts', 'craco']);
const TS_MOCHA_FLAGS = { '--paths': 'TS_CONFIG_PATHS', '--type-check': 'TS_TYPE_CHECK' };
const TS_MOCHA_PROJECT = new Set(['-p', '--project']);

const TOKEN = /(?<separator>&&|\|\||[;|&])|(?<word>(?:[^\s'"&;|]+|'[^']*'|"[^"]*")+)/gu;
const QUOTED = /'(?<single>[^']*)'|"(?<double>[^"]*)"/gu;

function unquote(word) {
  return word.replaceAll(QUOTED, (_match, single, double) => single ?? double);
}

export function tokenize(command) {
  return [...command.matchAll(TOKEN)].map(({ groups }) =>
    groups.separator === undefined ? unquote(groups.word) : { separator: groups.separator },
  );
}

function segments(command) {
  const result = [{ tokens: [], words: [] }];
  for (const { groups } of command.matchAll(TOKEN)) {
    if (groups.separator === undefined) {
      result.at(-1).tokens.push(unquote(groups.word));
      result.at(-1).words.push(groups.word);
    } else {
      result.push({ tokens: [], words: [] });
    }
  }
  return result.filter(({ tokens }) => tokens.length > 0);
}

function optionName(token) {
  const name = token.split('=')[0];
  return name.startsWith('--') ? name.replaceAll('-', '').toLowerCase() : name;
}

function droppedIndexes(token, index, valued) {
  if (!token.startsWith('-') || !valued.has(optionName(token))) {
    return [];
  }
  return token.includes('=') ? [index] : [index, index + 1];
}

export function withoutOptions(tokens, { flags = [], valued = [] }) {
  const valuedNames = new Set(valued.map(optionName));
  const flagNames = new Set(flags.map(optionName));
  const dropped = new Set(
    tokens.flatMap((token, index) => droppedIndexes(token, index, valuedNames)),
  );
  return tokens.filter(
    (token, index) =>
      !dropped.has(index) && !(token.startsWith('-') && flagNames.has(optionName(token))),
  );
}

function binaryName(token) {
  return token.split('/').at(-1).replace(BINARY_EXTENSION, '');
}

function isLauncher(tokens, index) {
  return JEST_LAUNCHERS.has(binaryName(tokens[index])) && tokens[index + 1] === 'test';
}

function nodeRunnerIndex(tokens) {
  return tokens.findIndex(
    (token, index) =>
      binaryName(token) === 'borp' ||
      (Object.hasOwn(NODE_WRAPPER_ARGUMENTS, binaryName(token)) &&
        tokens.includes('--test', index + 1)),
  );
}

const RUNNER_INDEXES = {
  vitest: (tokens) => tokens.findIndex((token) => binaryName(token) === 'vitest'),
  jest: (tokens) =>
    tokens.findIndex((token, index) => binaryName(token) === 'jest' || isLauncher(tokens, index)),
  mocha: (tokens) => tokens.findIndex((token) => MOCHA_BINARIES.has(binaryName(token))),
  node: nodeRunnerIndex,
};

function leadingEnvironment(tokens) {
  const environment = {};
  for (const token of tokens) {
    if (ENV_WRAPPERS.has(token)) {
      continue;
    }
    const match = ENV_ASSIGNMENT.exec(token);
    if (match === null) {
      break;
    }
    environment[match.groups.name] = match.groups.value;
  }
  return environment;
}

function nodeArgumentsBefore(tokens, runnerIndex) {
  const nodeIndex = tokens.findIndex((token) => binaryName(token) === 'node');
  return nodeIndex === -1 || nodeIndex >= runnerIndex
    ? []
    : tokens.slice(nodeIndex + 1, runnerIndex);
}

function nodeTestCommand(tokens, index) {
  const wrapper = binaryName(tokens[index]);
  if (wrapper === 'borp') {
    return { nodeArguments: [], arguments_: [] };
  }
  const testIndex = tokens.indexOf('--test', index + 1);
  return {
    nodeArguments: [
      ...NODE_WRAPPER_ARGUMENTS[wrapper],
      ...withoutOptions(tokens.slice(index + 1, testIndex), NODE_TEST_OPTIONS_NITPICKER_SETS),
    ],
    arguments_: withoutOptions(tokens.slice(testIndex + 1), NODE_TEST_OPTIONS_NITPICKER_SETS),
  };
}

function tsMochaCommand(tokens) {
  const projectIndex = tokens.findLastIndex((token) => TS_MOCHA_PROJECT.has(token));
  const project = projectIndex === -1 ? undefined : tokens[projectIndex + 1];
  const flags = tokens.filter((token) => Object.hasOwn(TS_MOCHA_FLAGS, token));
  return {
    environment: {
      ...(project === undefined ? {} : { TS_NODE_PROJECT: project }),
      ...Object.fromEntries(flags.map((flag) => [TS_MOCHA_FLAGS[flag], 'true'])),
    },
    arguments_: [
      '--require',
      'ts-mocha',
      ...withoutOptions(tokens, {
        flags: Object.keys(TS_MOCHA_FLAGS),
        valued: [...TS_MOCHA_PROJECT],
      }),
    ],
  };
}

function runnerParts(tokens, { runner, index }) {
  if (runner === 'node') {
    return nodeTestCommand(tokens, index);
  }
  if (isLauncher(tokens, index)) {
    return {
      nodeArguments: [],
      arguments_: tokens.slice(index + 2),
      launcher: binaryName(tokens[index]),
    };
  }
  const nodeArguments = nodeArgumentsBefore(tokens, index);
  return binaryName(tokens[index]) === 'ts-mocha'
    ? { nodeArguments, ...tsMochaCommand(tokens.slice(index + 1)) }
    : { nodeArguments, arguments_: tokens.slice(index + 1) };
}

function segmentCommand(tokens, found) {
  const { environment = {}, ...parts } = runnerParts(tokens, found);
  return { environment: { ...leadingEnvironment(tokens), ...environment }, ...parts };
}

function runnerAt(tokens, runner) {
  const index = RUNNER_INDEXES[runner](tokens);
  return index === -1 ? undefined : { runner, index };
}

function firstRunner(tokens) {
  return TEST_RUNNERS.map((runner) => runnerAt(tokens, runner))
    .filter((found) => found !== undefined)
    .toSorted((left, right) => left.index - right.index)[0];
}

export function commandRunners(command) {
  const runners = segments(command)
    .map(({ tokens }) => firstRunner(tokens)?.runner)
    .filter((runner) => runner !== undefined);
  return [...new Set(runners)];
}

export function parseTestCommand(command, runner) {
  if (typeof command !== 'string') {
    return undefined;
  }
  const parts = segments(command);
  for (const [position, { tokens }] of parts.entries()) {
    const found = runner === undefined ? firstRunner(tokens) : runnerAt(tokens, runner);
    if (found !== undefined) {
      return {
        runner: found.runner,
        command: {
          ...segmentCommand(tokens, found),
          precedingCommands: parts.slice(0, position).map(({ words }) => words.join(' ')),
        },
      };
    }
  }
  return undefined;
}

export function runnerCommand(command, runner) {
  return parseTestCommand(command, runner)?.command;
}
