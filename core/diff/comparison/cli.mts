import { didYouMean } from '../../../shared/messages/closest-match.mjs';

type OptionEntry = readonly [argument: string, value: string | undefined];

export type DrillDownOptions = {
  readonly analyzerNames: readonly string[];
  readonly ruleFilters: readonly string[];
  readonly projectPaths: readonly string[];
  readonly labelNames: readonly string[];
  readonly shardCount: number | undefined;
  readonly shardIndex: number | undefined;
  readonly jobs: number | undefined;
  readonly deferExit: boolean;
  readonly remainingArguments: readonly string[];
};

const closestSuggestion: (
  argument: string,
  candidates: readonly string[],
  quote: string,
) => string = didYouMean;

const VALUE_OPTIONS = new Set([
  '--analyzer',
  '--rule',
  '--project',
  '--label',
  '--shard-count',
  '--shard-index',
  '--jobs',
]);
const DEFER_EXIT = '--defer-exit';

export const DRILL_DOWN_OPTIONS = [...VALUE_OPTIONS, DEFER_EXIT];

export function unknownArgumentError(
  argument: string,
  candidates: readonly string[],
  guidance: string,
): Error {
  const suggestion = closestSuggestion(argument, candidates, '');
  return new Error(
    `Unknown argument: ${argument}${suggestion === '' ? '.' : suggestion} ${guidance}`,
  );
}

export function takeOptionValue(remaining: Iterator<string, undefined>, argument: string): string {
  const { value } = remaining.next();
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${argument} requires a value`);
  }
  return value;
}

function tokenize(commandArguments: readonly string[]): OptionEntry[] {
  const entries: OptionEntry[] = [];
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    const value = VALUE_OPTIONS.has(argument) ? takeOptionValue(remaining, argument) : undefined;
    entries.push([argument, value]);
  }
  return entries;
}

function valuesOf(entries: readonly OptionEntry[], name: string): string[] {
  return entries.flatMap(([argument, value]) =>
    argument === name && value !== undefined ? [value] : [],
  );
}

function jobsOf(entries: readonly OptionEntry[]): number | undefined {
  const value = valuesOf(entries, '--jobs').at(-1);
  if (value === undefined) {
    return undefined;
  }
  const jobs = Number(value);
  if (!Number.isInteger(jobs) || jobs < 1) {
    throw new Error(
      `--jobs takes a whole number of projects to run at once, 1 or more, not ${value}`,
    );
  }
  return jobs;
}

export function parseDrillDownOptions(commandArguments: readonly string[]): DrillDownOptions {
  const entries = tokenize(commandArguments);
  const analyzerNames = valuesOf(entries, '--analyzer');
  const shardCount = valuesOf(entries, '--shard-count').map(Number).at(-1);
  const shardIndex = valuesOf(entries, '--shard-index').map(Number).at(-1);
  if ((shardCount === undefined) !== (shardIndex === undefined)) {
    throw new Error('--shard-count and --shard-index must be provided together');
  }
  if (shardCount !== undefined && analyzerNames.length > 0) {
    throw new Error('--analyzer cannot be combined with --shard-count');
  }
  return {
    analyzerNames,
    ruleFilters: valuesOf(entries, '--rule'),
    projectPaths: valuesOf(entries, '--project'),
    labelNames: valuesOf(entries, '--label'),
    shardCount,
    shardIndex,
    jobs: jobsOf(entries),
    deferExit: entries.some(([argument]) => argument === DEFER_EXIT),
    remainingArguments: entries
      .map(([argument]) => argument)
      .filter((argument) => !VALUE_OPTIONS.has(argument) && argument !== DEFER_EXIT),
  };
}
