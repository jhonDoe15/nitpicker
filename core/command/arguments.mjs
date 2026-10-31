import { parseDrillDownOptions } from '../diff/comparison/cli.mjs';

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

function readPath(options, argument) {
  if (argument.startsWith('-')) {
    return false;
  }
  if (argument.trim() === '') {
    throw new Error('A path argument is empty; give a file or folder');
  }
  options.paths.push(argument);
  return true;
}

function remainingOptions(arguments_) {
  const options = { all: false, fix: false, help: false, cache: true, paths: [] };
  const remaining = arguments_.values();
  for (const argument of remaining) {
    if (readFlag(options, argument) || readPath(options, argument)) {
      continue;
    }
    const property = VALUES.get(argument);
    if (property === undefined) {
      throw new Error(`Unknown argument: ${argument}`);
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
  if (options.paths.length > 0 && options.shardCount !== undefined) {
    throw new Error(
      'Paths cannot be combined with --shard-count; shards always cover the whole project',
    );
  }
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
  'Usage: nitpicker [<path>...] [--base <ref>] [--output <dir>] [--all | --fix]' +
  ' [--analyzer <name>]... [--rule <substring>]...' +
  ' [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache] [--accept-policy-change=<digest>] [--help]\n' +
  '       nitpicker aggregate --input-root <directory> --shard-count <count>' +
  ' [--output <directory>] [--policy-root <directory>]\n' +
  '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]\n' +
  '       nitpicker base [--base <ref>]\n' +
  '       nitpicker explain <tool/rule>...\n' +
  '       nitpicker rules [--preset <name>] [--tool <name>]\n' +
  '\n' +
  'Paths (files or folders, relative to the current folder) limit the findings that are shown\n' +
  'and gate the run; the analysis still covers the whole project. Examples:\n' +
  '  nitpicker src/orders/order.ts    gate your change to one file\n' +
  '  nitpicker --all src/orders       show every finding in one folder\n';
