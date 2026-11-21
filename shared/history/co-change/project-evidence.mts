import { withoutExcluded } from '../../hygiene/rules.mts';
import { committedFiles } from '../../hygiene/tracked-files.mts';
import { collectEvidence, significantPairs } from './evidence/evidence.mts';
import { readHistory } from './evidence/git-history.mts';
import { moduleResolver } from './evidence/production-files.mts';
import { coChangeSettings } from './settings.mts';
import type { HistoryPolicy, ProjectEvidence } from '../typed/history-types.mts';

export function projectEvidence({
  projectRoot,
  policy = {},
  ref = 'HEAD',
}: {
  readonly projectRoot: string;
  readonly policy?: HistoryPolicy;
  readonly ref?: string | undefined;
}): ProjectEvidence {
  const settings = coChangeSettings(policy);
  if (settings === undefined) {
    return { enabled: false };
  }
  const history = readHistory({ projectRoot, commits: settings.commits, ref });
  if (!history.available) {
    return { enabled: true, settings, history };
  }
  const files = withoutExcluded(committedFiles(projectRoot, ref), policy.exclude);
  const moduleOf = moduleResolver({ projectRoot, files, policy });
  const evidence = collectEvidence({ commits: history.commits, moduleOf, settings });
  return {
    enabled: true,
    settings,
    history,
    moduleOf,
    used: evidence.used,
    pairs: significantPairs(evidence, settings),
  };
}
