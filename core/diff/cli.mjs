// Shared drill-down argument parsing for the single command and its shard workers.
export function parseDrillDownOptions(arguments_) {
  const analyzerNames = [];
  const ruleFilters = [];
  const remainingArguments = [];
  let deferExit = false;
  let shardCount;
  let shardIndex;
  let skipNext = false;
  for (const index of arguments_.keys()) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const argument = arguments_[index];
    if (
      argument === '--analyzer' ||
      argument === '--rule' ||
      argument === '--shard-count' ||
      argument === '--shard-index'
    ) {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === '--analyzer') analyzerNames.push(value);
      else if (argument === '--rule') ruleFilters.push(value);
      else if (argument === '--shard-count') shardCount = Number(value);
      else shardIndex = Number(value);
      skipNext = true;
      continue;
    }
    if (argument === '--defer-exit') {
      deferExit = true;
      continue;
    }
    remainingArguments.push(argument);
  }
  if ((shardCount === undefined) !== (shardIndex === undefined)) {
    throw new Error('--shard-count and --shard-index must be provided together');
  }
  if (shardCount !== undefined && analyzerNames.length > 0) {
    throw new Error('--analyzer cannot be combined with --shard-count');
  }
  return { analyzerNames, ruleFilters, shardCount, shardIndex, deferExit, remainingArguments };
}
