const VALUE_OPTIONS = new Set([
  '--analyzer',
  '--rule',
  '--project',
  '--shard-count',
  '--shard-index',
]);

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
    projectPaths: valuesOf(entries, '--project'),
    shardCount,
    shardIndex,
    deferExit: entries.some(([argument]) => argument === '--defer-exit'),
    remainingArguments: entries
      .map(([argument]) => argument)
      .filter((argument) => !VALUE_OPTIONS.has(argument) && argument !== '--defer-exit'),
  };
}
