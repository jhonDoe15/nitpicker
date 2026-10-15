import { parseDrillDownOptions } from '../diff/comparison/cli.mjs';

const FLAGS = new Map([
  ['--all', { property: 'all', value: true }],
  ['--fix', { property: 'fix', value: true }],
  ['--help', { property: 'help', value: true }],
  ['--no-cache', { property: 'cache', value: false }],
]);
const VALUES = new Map([
  ['--base', 'baseRef'],
  ['--output', 'outputRoot'],
]);

function remainingOptions(arguments_) {
  const options = { all: false, fix: false, help: false, cache: true };
  const remaining = arguments_.values();
  for (const argument of remaining) {
    const flag = FLAGS.get(argument);
    if (flag !== undefined) {
      options[flag.property] = flag.value;
      continue;
    }
    const property = VALUES.get(argument);
    if (property === undefined) throw new Error(`Unknown argument: ${argument}`);
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
  ' [--shard-count <n> --shard-index <i>] [--defer-exit] [--no-cache] [--help]\n' +
  '       nitpicker aggregate --input-root <directory> --shard-count <count>' +
  ' [--output <directory>] [--policy-root <directory>]\n' +
  '       nitpicker cache publish [--analyzer <name>]... [--shard-count <n> --shard-index <i>]\n';
