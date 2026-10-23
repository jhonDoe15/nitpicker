import { existsSync } from 'node:fs';
import { createCheckAnalyzer } from '../hygiene/analyzers.mjs';
import { git } from '../hygiene/tracked-files.mjs';
import { CHANGE_HISTORY_TOOL } from '../project-rules/hygiene-rules.mjs';
import { cloneDepth } from './co-change/evidence/git-history.mjs';

const HISTORY_RUNNER = 'history/runner.mjs';

function comparedHistory({ baselineRoot }) {
  return baselineRoot === undefined || !existsSync(baselineRoot)
    ? []
    : ['--history-ref', git(baselineRoot, ['rev-parse', 'HEAD']).trim()];
}

export function createHistoryAnalyzers(entryPath) {
  return [
    createCheckAnalyzer({
      name: CHANGE_HISTORY_TOOL,
      command: 'history',
      runner: HISTORY_RUNNER,
      entryPath,
      extraArguments: comparedHistory,
      environmentToken: cloneDepth,
    }),
  ];
}
