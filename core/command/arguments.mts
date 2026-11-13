import {
  DRILL_DOWN_OPTIONS,
  parseDrillDownOptions,
  unknownArgumentError,
} from '../diff/comparison/cli.mjs';
import { validateRunProfile } from '../quick/validate.mts';
import { didYouMean } from '../../shared/messages/closest-match.mjs';

type BooleanOption =
  'all' | 'details' | 'fix' | 'help' | 'json' | 'version' | 'cache' | 'quick' | 'staged';
type ValueOption = 'baseRef' | 'outputRoot';

type DrillDown = {
  readonly analyzerNames: readonly string[];
  readonly ruleFilters: readonly string[];
  readonly shardCount: number | undefined;
  readonly shardIndex: number | undefined;
  readonly deferExit: boolean;
  readonly remainingArguments: readonly string[];
};

type CommandOptions = Record<BooleanOption, boolean> &
  Partial<Record<ValueOption, string>> & {
    acceptPolicyChange?: string;
    readonly paths: string[];
  };

export type ParsedArguments = CommandOptions & Omit<DrillDown, 'remainingArguments'>;

const drillDownOptions: (arguments_: readonly string[]) => DrillDown = parseDrillDownOptions;
const closestSuggestion: (
  argument: string,
  candidates: readonly string[],
  fallback: string,
) => string = didYouMean;

const FLAGS = new Map<string, { readonly property: BooleanOption; readonly value: boolean }>([
  ['--all', { property: 'all', value: true }],
  ['--details', { property: 'details', value: true }],
  ['--fix', { property: 'fix', value: true }],
  ['--help', { property: 'help', value: true }],
  ['--json', { property: 'json', value: true }],
  ['--version', { property: 'version', value: true }],
  ['--no-cache', { property: 'cache', value: false }],
  ['--quick', { property: 'quick', value: true }],
  ['--staged', { property: 'staged', value: true }],
]);
const ACCEPT_FLAG = '--accept-policy-change';
const VALUES = new Map<string, ValueOption>([
  ['--base', 'baseRef'],
  ['--output', 'outputRoot'],
]);
const SUBCOMMANDS = ['aggregate', 'base', 'cache', 'init'];

export const COMPARISON_OPTIONS = [
  ...FLAGS.keys(),
  ...VALUES.keys(),
  ACCEPT_FLAG,
  ...DRILL_DOWN_OPTIONS,
];

const HELP_POINTER = 'Run nitpicker --help for the options.';

function unknownArgument(argument: string): Error {
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

function acceptedDigest(argument: string): string {
  const digest = argument.slice(ACCEPT_FLAG.length + 1);
  if (digest === '') {
    throw new Error(
      `${ACCEPT_FLAG} takes the digest that the policy-loosened finding names: ${ACCEPT_FLAG}=<digest>`,
    );
  }
  return digest;
}

function isAcceptFlag(argument: string): boolean {
  return argument === ACCEPT_FLAG || argument.startsWith(`${ACCEPT_FLAG}=`);
}

function readFlag(options: CommandOptions, argument: string): boolean {
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

export function missingPathHint(argument: string): string {
  const suggestion = closestSuggestion(argument, [...SUBCOMMANDS, ...COMPARISON_OPTIONS], '');
  return suggestion === '' ? '' : `${suggestion} ${HELP_POINTER}`;
}

function readPath(options: CommandOptions, argument: string): boolean {
  if (argument.startsWith('-')) {
    return false;
  }
  if (SUBCOMMANDS.includes(argument)) {
    throw unknownArgument(argument);
  }
  if (argument.trim() === '') {
    throw new Error('A path argument is empty; give a file or folder');
  }
  options.paths.push(argument);
  return true;
}

function remainingOptions(commandArguments: readonly string[]): CommandOptions {
  const options: CommandOptions = {
    all: false,
    details: false,
    fix: false,
    help: false,
    json: false,
    version: false,
    cache: true,
    quick: false,
    staged: false,
    paths: [],
  };
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    if (readFlag(options, argument) || readPath(options, argument)) {
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

function validateModes(options: ParsedArguments): void {
  if (options.paths.length > 0 && options.shardCount !== undefined) {
    throw new Error(
      'Paths cannot be combined with --shard-count; shards always cover the whole project',
    );
  }
  if (!options.all) return;
  if (options.fix) throw new Error('--fix cannot be combined with --all');
  const conflicts: readonly (readonly [boolean, string])[] = [
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

export function parseArguments(commandArguments: readonly string[]): ParsedArguments {
  const { remainingArguments, ...drillDown } = drillDownOptions(commandArguments);
  const options = { ...remainingOptions(remainingArguments), ...drillDown };
  validateModes(options);
  validateRunProfile(options);
  return options;
}
