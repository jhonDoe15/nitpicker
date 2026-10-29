import { runCheckCli } from '../hygiene/cli.mjs';
import { withoutExcepted } from '../hygiene/rules.mjs';
import { CHANGE_HISTORY_TOOL } from '../project-rules/hygiene-rules.mjs';
import { collectChangeHistoryFindings } from './co-change/check.mjs';

export function runHistoryCheck({ check, projectRoot, policy = {}, historyRef }) {
  if (check !== CHANGE_HISTORY_TOOL) {
    throw new Error(`Unknown history check: ${check}`);
  }
  const findings = collectChangeHistoryFindings({ projectRoot, ref: historyRef, policy });
  return withoutExcepted(findings, policy.exceptions);
}

export function runHistoryCli(cli) {
  return runCheckCli({ ...cli, runCheck: runHistoryCheck, label: 'History' });
}
