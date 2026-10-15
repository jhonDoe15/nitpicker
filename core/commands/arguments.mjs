import { parseDrillDownOptions } from '../diff/cli.mjs';

const FLAGS = new Map([
  ['--all', { key: 'all', value: true }],
  ['--fix', { key: 'fix', value: true }],
  ['--no-cache', { key: 'cache', value: false }],
  ['--help', { key: 'help', value: true }],
]);
const VALUE_OPTIONS = new Map([
  ['--base', 'baseRef'],
  ['--output', 'outputRoot'],
]);
const ALL_CONFLICTS = [
  { conflicts: (options) => options.fix, message: '--fix cannot be combined with --all' },
  {
    conflicts: (options) => options.baseRef !== undefined,
    message: '--all cannot be combined with --base',
  },
  {
    conflicts: (options) => options.shardCount !== undefined || options.shardIndex !== undefined,
    message: '--all cannot be combined with --shard-count or --shard-index',
  },
  {
    conflicts: (options) => options.deferExit,
    message: '--all cannot be combined with --defer-exit',
  },
];

export function parseArguments(arguments_) {
  const { analyzerNames, ruleFilters, shardCount, shardIndex, deferExit, remainingArguments } =
    parseDrillDownOptions(arguments_);
  const options = {
    all: false,
    fix: false,
    baseRef: undefined,
    outputRoot: undefined,
    analyzerNames,
    ruleFilters,
    shardCount,
    shardIndex,
    deferExit,
    cache: true,
    help: false,
  };
  readCommandOptions(remainingArguments, options);
  const conflict = ALL_CONFLICTS.find(({ conflicts }) => options.all && conflicts(options));
  if (conflict !== undefined) {
    throw new Error(conflict.message);
  }
  return options;
}

function readCommandOptions(remainingArguments, options) {
  const awaiting = { option: undefined };
  for (const argument of remainingArguments) {
    if (awaiting.option === undefined) {
      readOption(argument, options, awaiting);
      continue;
    }
    requireValue(awaiting.option, argument);
    options[VALUE_OPTIONS.get(awaiting.option)] = argument;
    awaiting.option = undefined;
  }
  if (awaiting.option !== undefined) {
    requireValue(awaiting.option, undefined);
  }
}

function readOption(argument, options, awaiting) {
  const flag = FLAGS.get(argument);
  if (flag !== undefined) {
    options[flag.key] = flag.value;
    return;
  }
  if (!VALUE_OPTIONS.has(argument)) {
    throw new Error(`Unknown argument: ${argument}`);
  }
  awaiting.option = argument;
}

function requireValue(option, value) {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
}
