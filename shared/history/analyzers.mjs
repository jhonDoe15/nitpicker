import { createCheckAnalyzer } from '../hygiene/analyzers.mjs';
import { CHANGE_HISTORY_TOOL } from '../project-rules/hygiene-rules.mjs';

const HISTORY_RUNNER = 'history/runner.mjs';

export function createHistoryAnalyzers(entryPath) {
  return [
    createCheckAnalyzer({
      name: CHANGE_HISTORY_TOOL,
      command: 'history',
      runner: HISTORY_RUNNER,
      entryPath,
    }),
  ];
}
