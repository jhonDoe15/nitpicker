import { parseDrillDownOptions } from '../diff/cli.mjs';

export function parseArguments(arguments_) {
  const { analyzerNames, ruleFilters, shardCount, shardIndex, deferExit, remainingArguments } =
    parseDrillDownOptions(arguments_);
  let all = false;
  let fix = false;
  let baseRef;
  let outputRoot;
  let help = false;
  let cache = true;

  for (let index = 0; index < remainingArguments.length; index += 1) {
    const argument = remainingArguments[index];
    if (argument === '--all') {
      all = true;
      continue;
    }
    if (argument === '--fix') {
      fix = true;
      continue;
    }
    if (argument === '--no-cache') {
      cache = false;
      continue;
    }
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--base' || argument === '--output') {
      const value = remainingArguments[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === '--base') {
        baseRef = value;
      } else {
        outputRoot = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (all && fix) {
    throw new Error('--fix cannot be combined with --all');
  }
  if (all && baseRef !== undefined) {
    throw new Error('--all cannot be combined with --base');
  }
  if (all && (shardCount !== undefined || shardIndex !== undefined)) {
    throw new Error('--all cannot be combined with --shard-count or --shard-index');
  }
  if (all && deferExit) {
    throw new Error('--all cannot be combined with --defer-exit');
  }

  return {
    all,
    fix,
    baseRef,
    outputRoot,
    analyzerNames,
    ruleFilters,
    shardCount,
    shardIndex,
    deferExit,
    cache,
    help,
  };
}
