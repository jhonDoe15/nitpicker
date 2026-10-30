import {
  DRILL_DOWN_OPTIONS,
  parseDrillDownOptions,
  unknownArgumentError,
} from '../diff/comparison/cli.mjs';

const FLAGS = new Map([
  ['--all', { property: 'all', value: true }],
  ['--fix', { property: 'fix', value: true }],
  ['--help', { property: 'help', value: true }],
  ['--no-cache', { property: 'cache', value: false }],
]);
const ACCEPT_FLAG = '--accept-policy-change';
const VALUES = new Map([
  ['--base', 'baseRef'],
  ['--output', 'outputRoot'],
]);
const SUBCOMMANDS = ['aggregate', 'base', 'cache'];

const COMPARISON_OPTIONS = [...FLAGS.keys(), ...VALUES.keys(), ACCEPT_FLAG, ...DRILL_DOWN_OPTIONS];

const HELP_POINTER = 'Run nitpicker --help for the options.';

function unknownArgument(argument) {
  if (SUBCOMMANDS.includes(argument)) {
    return new Error(
      `Unknown argument: ${argument}. A subcommand goes first, as in nitpicker ${argument}. ${HELP_POINTER}`,
    );
  }
  const candidates = argument.startsWith('-')
    ? COMPARISON_OPTIONS
    : [...SUBCOMMANDS, ...COMPARISON_OPTIONS];
  return unknownArgumentError(argument, candidates, HELP_POINTER);
}

function acceptedDigest(argument) {
  const digest = argument.slice(ACCEPT_FLAG.length + 1);
  if (digest === '') {
    throw new Error(
      `${ACCEPT_FLAG} takes the digest that the policy-loosened finding names: ${ACCEPT_FLAG}=<digest>`,
    );
  }
  return digest;
}

function isAcceptFlag(argument) {
  return argument === ACCEPT_FLAG || argument.startsWith(`${ACCEPT_FLAG}=`);
}

function readFlag(options, argument) {
  if (isAcceptFlag(argument)) {
    options.acceptPolicyChange = acceptedDigest(argument);
    return true;
  }
  const flag = FLAGS.get(argument);
  if (flag !== undefined) {
    options[flag.property] = flag.value;
  }
  return flag !== undefined;
}

function remainingOptions(arguments_) {
  const options = { all: false, fix: false, help: false, cache: true };
  const remaining = arguments_.values();
  for (const argument of remaining) {
    if (readFlag(options, argument)) {
      continue;
    }
    const property = VALUES.get(argument);
    if (property === undefined) {
      throw unknownArgument(argument);
    }
    const value = remaining.next().value;
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value`);
    }
    options[property] = value;
  }
  return options;
}

function validateModes(options) {
  if (!options.all) return;
  if (options.fix) throw new Error('--fix cannot be combined with --all');
  const conflicts = [
    [options.baseRef !== undefined, '--base'],
    [
      options.shardCount !== undefined || options.shardIndex !== undefined,
      '--shard-count or --shard-index',
    ],
    [options.deferExit, '--defer-exit'],
  ];
  for (const [selected, argument] of conflicts) {
    if (selected) throw new Error(`--all cannot be combined with ${argument}`);
  }
}

export function parseArguments(arguments_) {
  const { remainingArguments, ...drillDown } = parseDrillDownOptions(arguments_);
  const options = { ...remainingOptions(remainingArguments), ...drillDown };
  validateModes(options);
  return options;
}

export const USAGE_TEXT =
  'Usage: nitpicker [--base <ref>] [--output <dir>] [--all | --fix]' +
  ' [--analyzer <name>]... [--rule <substring>]...' +
  ' [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache] [--accept-policy-change=<digest>] [--help]\n' +
  '       nitpicker aggregate --input-root <directory> --shard-count <count>' +
  ' [--output <directory>] [--policy-root <directory>]\n' +
  '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]\n' +
  '       nitpicker base [--base <ref>]\n';
