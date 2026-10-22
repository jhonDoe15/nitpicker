import { runCheckCli } from '../hygiene/cli.mjs';
import { withoutExcepted, withoutExcluded } from '../hygiene/rules.mjs';
import { trackedFiles } from '../hygiene/tracked-files.mjs';
import { CHANGE_HISTORY_TOOL } from '../project-rules/hygiene-rules.mjs';
import { collectChangeHistoryFindings } from './co-change/check.mjs';

export function runHistoryCheck({ check, projectRoot, policy = {} }) {
  if (check !== CHANGE_HISTORY_TOOL) {
    throw new Error(`Unknown history check: ${check}`);
  }
  function listFiles() {
    return withoutExcluded(trackedFiles(projectRoot), policy.exclude);
  }
  const findings = collectChangeHistoryFindings({ projectRoot, listFiles, policy });
  return withoutExcepted(findings, policy.exceptions);
}

export function runHistoryCli(cli) {
  return runCheckCli({ ...cli, runCheck: runHistoryCheck, label: 'History' });
}
