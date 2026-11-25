import { runCheckCli } from '../hygiene/cli.mts';
import { withoutExcepted } from '../hygiene/rules.mts';
import { CHANGE_HISTORY_TOOL } from '../project-rules/hygiene-rules.mts';
import { collectChangeHistoryFindings } from './co-change/check.mts';
import type { HistoryPolicy } from './typed/history-types.mts';
import type { CheckArguments, CheckCliInput } from '../hygiene/check-types.mts';

type HistoryCheckOptions = Readonly<CheckArguments> & { readonly policy?: HistoryPolicy };

export function runHistoryCheck({
  check,
  projectRoot,
  policy = {},
  historyRef,
}: HistoryCheckOptions): ReturnType<typeof withoutExcepted> {
  if (check !== CHANGE_HISTORY_TOOL) {
    throw new Error(`Unknown history check: ${String(check)}`);
  }
  const findings = collectChangeHistoryFindings({
    projectRoot: projectRoot ?? process.cwd(),
    ref: historyRef,
    policy,
  });
  return withoutExcepted(findings, policy.exceptions);
}

export function runHistoryCli(cli: Omit<CheckCliInput, 'runCheck' | 'label'>): number {
  return runCheckCli({ ...cli, runCheck: runHistoryCheck, label: 'History' });
}
