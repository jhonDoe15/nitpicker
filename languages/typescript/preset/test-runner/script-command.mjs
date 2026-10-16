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
    if (typeof token === 'string') {
      result.at(-1).push(token);
    } else {
      result.push([]);
    }
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

function nodeFlagsBefore(segment, runnerIndex) {
  const nodeIndex = segment.findIndex((token) => binaryName(token) === 'node');
  return nodeIndex === -1 || nodeIndex >= runnerIndex
    ? []
    : segment.slice(nodeIndex + 1, runnerIndex).filter((token) => token.startsWith('-'));
}

const NODE_WRAPPER_ARGUMENTS = { node: [], tsx: ['--import', 'tsx'] };

function nodeTestCommand(segment) {
  const nodeIndex = segment.findIndex((token) =>
    Object.hasOwn(NODE_WRAPPER_ARGUMENTS, binaryName(token)),
  );
  const testIndex = segment.indexOf('--test', nodeIndex + 1);
  if (nodeIndex === -1 || testIndex === -1) {
    return undefined;
  }
  return {
    environment: leadingEnvironment(segment),
    nodeArguments: [
      ...NODE_WRAPPER_ARGUMENTS[binaryName(segment[nodeIndex])],
      ...segment.slice(nodeIndex + 1, testIndex),
    ],
    arguments_: segment.slice(testIndex + 1),
  };
}

function segmentCommand(segment, runner) {
  if (runner === 'node') {
    return nodeTestCommand(segment);
  }
  const runnerIndex = segment.findIndex((token) => isRunnerToken(runner, token));
  if (runnerIndex === -1) {
    return undefined;
  }
  return {
    environment: leadingEnvironment(segment),
    nodeArguments: nodeFlagsBefore(segment, runnerIndex),
    arguments_: segment.slice(runnerIndex + 1),
  };
}

export function runnerCommand(command, runner) {
  if (typeof command !== 'string') {
    return undefined;
  }
  return segments(tokenize(command))
    .map((segment) => segmentCommand(segment, runner))
    .find((found) => found !== undefined);
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
