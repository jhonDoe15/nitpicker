import { withoutExcluded } from '../../hygiene/rules.mjs';
import { trackedFiles } from '../../hygiene/tracked-files.mjs';
import { collectEvidence, significantPairs } from './evidence/evidence.mjs';
import { readHistory } from './evidence/git-history.mjs';
import { moduleResolver } from './evidence/production-files.mjs';
import { coChangeSettings } from './settings.mjs';

export function projectEvidence({
  projectRoot,
  policy = {},
  listFiles = () => withoutExcluded(trackedFiles(projectRoot), policy.exclude),
}) {
  const settings = coChangeSettings(policy);
  if (settings === undefined) {
    return { enabled: false };
  }
  const history = readHistory({ projectRoot, commits: settings.commits });
  if (!history.available) {
    return { enabled: true, history };
  }
  const moduleOf = moduleResolver({ projectRoot, files: listFiles(), policy });
  const evidence = collectEvidence({ commits: history.commits, moduleOf, settings });
  return {
    enabled: true,
    history,
    moduleOf,
    used: evidence.used,
    pairs: significantPairs(evidence, settings),
  };
}
