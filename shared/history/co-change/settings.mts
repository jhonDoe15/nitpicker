import { CO_CHANGE_DEFAULTS } from '../../project-rules/hygiene-rules.mts';
import type { CoChangeSettings, HistoryPolicy } from '../typed/history-types.mts';

export function coChangeSettings(policy: HistoryPolicy = {}): CoChangeSettings | undefined {
  const history = policy.history;
  return history?.coChange === true
    ? {
        commits: history.commits ?? CO_CHANGE_DEFAULTS.commits,
        minSupport: history.minSupport ?? CO_CHANGE_DEFAULTS.minSupport,
        minConfidence: history.minConfidence ?? CO_CHANGE_DEFAULTS.minConfidence,
        maxCommitFiles: history.maxCommitFiles ?? CO_CHANGE_DEFAULTS.maxCommitFiles,
      }
    : undefined;
}
