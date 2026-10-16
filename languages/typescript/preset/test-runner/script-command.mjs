const ENV_ASSIGNMENT = /^(?<name>[A-Za-z_]\w*)=(?<value>.*)$/su;
const ENV_WRAPPERS = new Set(['cross-env', 'env']);

const RUNNER_BINARIES = {
  vitest: ['vitest'],
  jest: ['jest'],
  mocha: ['mocha', '_mocha'],
  node: ['node'],
};

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

function segments(tokens) {
  const result = [[]];
  for (const token of tokens) {
    if (typeof token === 'string') result.at(-1).push(token);
    else result.push([]);
  }
  return result;
}

function binaryName(token) {
  const name = token.split('/').at(-1);
  return name.replace(/\.(?:c|m)?js$/u, '');
}

function isRunnerToken(runner, token) {
  return RUNNER_BINARIES[runner].includes(binaryName(token));
}

function leadingEnvironment(segment) {
  const environment = {};
  for (const token of segment) {
    if (ENV_WRAPPERS.has(token)) continue;
    const match = ENV_ASSIGNMENT.exec(token);
    if (match === null) break;
    environment[match.groups.name] = match.groups.value;
  }
  return environment;
}

function nodeFlagsBefore(segment, runnerIndex) {
  const nodeIndex = segment.findIndex((token) => binaryName(token) === 'node');
  return nodeIndex === -1 || nodeIndex >= runnerIndex
    ? []
    : segment.slice(nodeIndex + 1, runnerIndex).filter((token) => token.startsWith('-'));
}

function nodeTestCommand(segment) {
  const nodeIndex = segment.findIndex((token) => binaryName(token) === 'node');
  const testIndex = segment.indexOf('--test', nodeIndex + 1);
  if (nodeIndex === -1 || testIndex === -1) return undefined;
  return {
    environment: leadingEnvironment(segment),
    nodeArguments: segment.slice(nodeIndex + 1, testIndex),
    arguments_: segment.slice(testIndex + 1),
  };
}

export function runnerCommand(command, runner) {
  if (typeof command !== 'string') return undefined;
  for (const segment of segments(tokenize(command))) {
    if (runner === 'node') {
      const nodeCommand = nodeTestCommand(segment);
      if (nodeCommand !== undefined) return nodeCommand;
      continue;
    }
    const runnerIndex = segment.findIndex((token) => isRunnerToken(runner, token));
    if (runnerIndex === -1) continue;
    return {
      environment: leadingEnvironment(segment),
      nodeArguments: nodeFlagsBefore(segment, runnerIndex),
      arguments_: segment.slice(runnerIndex + 1),
    };
  }
  return undefined;
}

function optionName(token) {
  return token.split('=')[0].replaceAll('-', '').toLowerCase();
}

function droppedIndexes(token, index, valued) {
  if (!token.startsWith('-') || !valued.has(optionName(token))) return [];
  return token.includes('=') ? [index] : [index, index + 1];
}

export function withoutOptions(arguments_, { flags = [], valued = [] }) {
  const valuedNames = new Set(valued.map(optionName));
  const flagNames = new Set(flags.map(optionName));
  const dropped = new Set(
    arguments_.flatMap((token, index) => droppedIndexes(token, index, valuedNames)),
  );
  return arguments_.filter(
    (token, index) =>
      !dropped.has(index) && !(token.startsWith('-') && flagNames.has(optionName(token))),
  );
}
