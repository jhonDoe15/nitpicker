import { NODE_TEST_OPTIONS_NITPICKER_SETS, TEST_RUNNERS } from './runners.mts';
import type {
  CommandEnvironment,
  CommandParts,
  CommandSegment,
  FoundRunner,
  OptionSets,
  ParsedTestCommand,
  TestCommand,
} from './typed/command-types.mts';

const ENV_ASSIGNMENT = /^(?<name>[A-Za-z_]\w*)=(?<value>.*)$/su;
const ENV_WRAPPERS = new Set(['cross-env', 'env']);
const BINARY_EXTENSION = /\.(?:[cm]?js|cmd)$/u;

const NODE_WRAPPER_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  node: [],
  tsx: ['--import', 'tsx'],
};
const TS_MOCHA = 'ts-mocha';
const MOCHA_BINARIES = new Set(['mocha', '_mocha', TS_MOCHA]);
const JEST_LAUNCHERS = new Set(['react-scripts', 'craco', 'react-app-rewired', 'rescripts']);
const TS_MOCHA_FLAGS: Readonly<Record<string, string>> = {
  '--paths': 'TS_CONFIG_PATHS',
  '--type-check': 'TS_TYPE_CHECK',
};
const TS_MOCHA_PROJECT = new Set(['-p', '--project']);

const TOKEN = /(?<separator>&&|\|\||[;|&])|(?<word>(?:[^\s'"&;|]|'[^']*'|"[^"]*")+)/gu;
const QUOTED = /'(?<single>[^']*)'|"(?<double>[^"]*)"/gu;

function unquote(word: string): string {
  return word.replaceAll(
    QUOTED,
    (_match, single: string | undefined, double: string | undefined) => single ?? double ?? '',
  );
}

function newSegment(): CommandSegment {
  return { tokens: [], words: [], starts: [] };
}

export function tokenize(command: string): (string | { readonly separator: string })[] {
  return [...command.matchAll(TOKEN)].map(({ groups }) => {
    const { separator, word } = groups ?? {};
    return separator === undefined ? unquote(word ?? '') : { separator };
  });
}

export function commandSegments(command: string): CommandSegment[] {
  let current = newSegment();
  const result = [current];
  for (const { groups, index } of command.matchAll(TOKEN)) {
    const { separator, word = '' } = groups ?? {};
    if (separator === undefined) {
      current.tokens.push(unquote(word));
      current.words.push(word);
      current.starts.push(index);
    } else {
      current = newSegment();
      result.push(current);
    }
  }
  return result.filter(({ tokens }) => tokens.length > 0);
}

function optionName(token: string): string {
  const [name = ''] = token.split('=');
  return name.startsWith('--') ? name.replaceAll('-', '').toLowerCase() : name;
}

function droppedIndexes(token: string, index: number, valued: ReadonlySet<string>): number[] {
  if (!(token.startsWith('-') && valued.has(optionName(token)))) {
    return [];
  }
  return token.includes('=') ? [index] : [index, index + 1];
}

function variadicIndexes(tokens: readonly string[], variadic: readonly string[]): number[] {
  const names = new Set(variadic.map(optionName));
  let dropping = false;
  return tokens.flatMap((token, index) => {
    if (token.startsWith('-')) {
      dropping = names.has(optionName(token));
    }
    return dropping ? [index] : [];
  });
}

export function withoutOptions(
  tokens: readonly string[],
  { flags = [], valued = [], variadic = [] }: OptionSets,
): string[] {
  const valuedNames = new Set(valued.map(optionName));
  const flagNames = new Set(flags.map(optionName));
  const dropped = new Set([
    ...tokens.flatMap((token, index) => droppedIndexes(token, index, valuedNames)),
    ...variadicIndexes(tokens, variadic),
  ]);
  return tokens.filter(
    (token, index) =>
      !(dropped.has(index) || (token.startsWith('-') && flagNames.has(optionName(token)))),
  );
}

export function binaryName(token: string): string {
  return (token.split('/').at(-1) ?? '').replace(BINARY_EXTENSION, '');
}

function isLauncher(tokens: readonly string[], index: number): boolean {
  return JEST_LAUNCHERS.has(binaryName(tokens[index] ?? '')) && tokens[index + 1] === 'test';
}

function nodeRunnerIndex(tokens: readonly string[]): number {
  return tokens.findIndex(
    (token, index) =>
      binaryName(token) === 'borp' ||
      (Object.hasOwn(NODE_WRAPPER_ARGUMENTS, binaryName(token)) &&
        tokens.includes('--test', index + 1)),
  );
}

const RUNNER_INDEXES: Readonly<Record<string, (tokens: readonly string[]) => number>> = {
  vitest: (tokens) => tokens.findIndex((token) => binaryName(token) === 'vitest'),
  jest: (tokens) =>
    tokens.findIndex((token, index) => binaryName(token) === 'jest' || isLauncher(tokens, index)),
  mocha: (tokens) => tokens.findIndex((token) => MOCHA_BINARIES.has(binaryName(token))),
  node: nodeRunnerIndex,
};

function leadingEnvironment(tokens: readonly string[]): CommandEnvironment {
  const environment: Record<string, string> = {};
  for (const token of tokens) {
    if (ENV_WRAPPERS.has(token)) {
      continue;
    }
    const match = ENV_ASSIGNMENT.exec(token);
    if (match === null) {
      break;
    }
    const { name = '', value = '' } = match.groups ?? {};
    environment[name] = value;
  }
  return environment;
}

function nodeArgumentsBefore(tokens: readonly string[], runnerIndex: number): string[] {
  const nodeIndex = tokens.findIndex((token) => binaryName(token) === 'node');
  return nodeIndex === -1 || nodeIndex >= runnerIndex
    ? []
    : tokens.slice(nodeIndex + 1, runnerIndex);
}

function nodeTestCommand(tokens: readonly string[], index: number): CommandParts {
  const wrapper = binaryName(tokens[index] ?? '');
  if (wrapper === 'borp') {
    return { nodeArguments: [], arguments_: [] };
  }
  const testIndex = tokens.indexOf('--test', index + 1);
  return {
    nodeArguments: [
      ...(NODE_WRAPPER_ARGUMENTS[wrapper] ?? []),
      ...withoutOptions(tokens.slice(index + 1, testIndex), NODE_TEST_OPTIONS_NITPICKER_SETS),
    ],
    arguments_: withoutOptions(tokens.slice(testIndex + 1), NODE_TEST_OPTIONS_NITPICKER_SETS),
  };
}

function tsMochaCommand(tokens: readonly string[]): Omit<CommandParts, 'nodeArguments'> {
  const projectIndex = tokens.findLastIndex((token) => TS_MOCHA_PROJECT.has(token));
  const project = projectIndex === -1 ? undefined : tokens[projectIndex + 1];
  const flags = tokens.filter((token) => Object.hasOwn(TS_MOCHA_FLAGS, token));
  return {
    environment: {
      ...(project === undefined ? {} : { TS_NODE_PROJECT: project }),
      ...Object.fromEntries(flags.map((flag) => [TS_MOCHA_FLAGS[flag] ?? '', 'true'])),
    },
    arguments_: [
      '--require',
      TS_MOCHA,
      ...withoutOptions(tokens, {
        flags: Object.keys(TS_MOCHA_FLAGS),
        valued: [...TS_MOCHA_PROJECT],
      }),
    ],
  };
}

function runnerParts(tokens: readonly string[], { runner, index }: FoundRunner): CommandParts {
  if (runner === 'node') {
    return nodeTestCommand(tokens, index);
  }
  if (isLauncher(tokens, index)) {
    return {
      nodeArguments: [],
      arguments_: tokens.slice(index + 2),
      launcher: binaryName(tokens[index] ?? ''),
    };
  }
  const nodeArguments = nodeArgumentsBefore(tokens, index);
  return binaryName(tokens[index] ?? '') === TS_MOCHA
    ? { nodeArguments, ...tsMochaCommand(tokens.slice(index + 1)) }
    : { nodeArguments, arguments_: tokens.slice(index + 1) };
}

function segmentCommand(
  tokens: readonly string[],
  found: FoundRunner,
): Omit<TestCommand, 'precedingCommands'> {
  const { environment = {}, ...parts } = runnerParts(tokens, found);
  return { environment: { ...leadingEnvironment(tokens), ...environment }, ...parts };
}

function runnerAt(tokens: readonly string[], runner: string): FoundRunner | undefined {
  const indexOf = RUNNER_INDEXES[runner];
  if (indexOf === undefined) {
    throw new TypeError(`Unknown test runner: ${runner}`);
  }
  const index = indexOf(tokens);
  return index === -1 ? undefined : { runner, index };
}

function firstRunner(tokens: readonly string[]): FoundRunner | undefined {
  return TEST_RUNNERS.map((runner) => runnerAt(tokens, runner))
    .filter((found) => found !== undefined)
    .reduce<FoundRunner | undefined>(
      (first, found) => (first === undefined || found.index < first.index ? found : first),
      undefined,
    );
}

export function commandRunners(command: string): string[] {
  const runners = commandSegments(command)
    .map(({ tokens }) => firstRunner(tokens)?.runner)
    .filter((runner) => runner !== undefined);
  return [...new Set(runners)];
}

export function parseTestCommand(command: unknown, runner?: string): ParsedTestCommand | undefined {
  if (typeof command !== 'string') {
    return undefined;
  }
  const parts = commandSegments(command);
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

export function runnerCommand(command: unknown, runner?: string): TestCommand | undefined {
  return parseTestCommand(command, runner)?.command;
}
