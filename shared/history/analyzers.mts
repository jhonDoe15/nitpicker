import { existsSync } from 'node:fs';
import { createCheckAnalyzer } from '../hygiene/analyzers.mts';
import { git } from '../hygiene/tracked-files.mts';
import { CHANGE_HISTORY_TOOL } from '../project-rules/hygiene-rules.mts';
import { EVERYTHING_INPUTS } from '../input-sets/inputs.mts';
import { cloneDepth } from './co-change/evidence/git-history.mts';

const HISTORY_RUNNER = 'history/runner.mjs';

function comparedHistory({
  baselineRoot,
}: {
  readonly baselineRoot?: string | undefined;
}): string[] {
  return baselineRoot === undefined || !existsSync(baselineRoot)
    ? []
    : ['--history-ref', git(baselineRoot, ['rev-parse', 'HEAD']).trim()];
}

export function createHistoryAnalyzers(
  entryPath: string,
): ReturnType<typeof createCheckAnalyzer>[] {
  return [
    createCheckAnalyzer({
      name: CHANGE_HISTORY_TOOL,
      command: 'history',
      runner: HISTORY_RUNNER,
      entryPath,
      extraArguments: comparedHistory,
      inputs: EVERYTHING_INPUTS,
      environmentToken: cloneDepth,
    }),
  ];
}
