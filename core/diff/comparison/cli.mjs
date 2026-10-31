import { didYouMean } from '../../../shared/messages/closest-match.mjs';

const VALUE_OPTIONS = new Set(['--analyzer', '--rule', '--shard-count', '--shard-index']);
const DEFER_EXIT = '--defer-exit';

export const DRILL_DOWN_OPTIONS = [...VALUE_OPTIONS, DEFER_EXIT];

export function unknownArgumentError(argument, candidates, guidance) {
  const suggestion = didYouMean(argument, candidates, '');
  return new Error(
    `Unknown argument: ${argument}${suggestion === '' ? '.' : suggestion} ${guidance}`,
  );
}

export function takeOptionValue(remaining, argument) {
  const { value } = remaining.next();
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${argument} requires a value`);
  }
  return value;
}

function tokenize(arguments_) {
  const entries = [];
  const remaining = arguments_.values();
  for (const argument of remaining) {
    const value = VALUE_OPTIONS.has(argument) ? takeOptionValue(remaining, argument) : undefined;
    entries.push([argument, value]);
  }
  return entries;
}

function valuesOf(entries, name) {
  return entries.filter(([argument]) => argument === name).map(([, value]) => value);
}

export function parseDrillDownOptions(arguments_) {
  const entries = tokenize(arguments_);
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
    shardCount,
    shardIndex,
    deferExit: entries.some(([argument]) => argument === DEFER_EXIT),
    remainingArguments: entries
      .map(([argument]) => argument)
      .filter((argument) => !VALUE_OPTIONS.has(argument) && argument !== DEFER_EXIT),
  };
}
