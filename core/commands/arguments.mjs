import { parseDrillDownOptions } from '../diff/cli.mjs';

const FLAGS = new Map([
  ['--all', { key: 'all', value: true }],
  ['--fix', { key: 'fix', value: true }],
  ['--no-cache', { key: 'cache', value: false }],
  ['--help', { key: 'help', value: true }],
  ['--accept-policy-change', { key: 'acceptPolicyChange', value: true }],
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
    acceptPolicyChange: false,
  };
  readCommandOptions(remainingArguments, options);
  const conflict = ALL_CONFLICTS.find(({ conflicts }) => options.all && conflicts(options));
  if (conflict !== undefined) {
    throw new Error(conflict.message);
  }
  return options;
}

function readCommandOptions(remainingArguments, options) {
  const values = new Set();
  for (const [index, argument] of remainingArguments.entries()) {
    if (values.has(index)) {
      continue;
    }
    const valueKey = VALUE_OPTIONS.get(argument);
    if (valueKey === undefined) {
      readFlag(argument, options);
      continue;
    }
    const value = remainingArguments[index + 1];
    requireValue(argument, value);
    options[valueKey] = value;
    values.add(index + 1);
  }
}

function readFlag(argument, options) {
  const flag = FLAGS.get(argument);
  if (flag === undefined) {
    throw new Error(`Unknown argument: ${argument}`);
  }
  options[flag.key] = flag.value;
}

function requireValue(option, value) {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
}
