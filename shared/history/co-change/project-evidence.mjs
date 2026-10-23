import { withoutExcluded } from '../../hygiene/rules.mjs';
import { committedFiles } from '../../hygiene/tracked-files.mjs';
import { collectEvidence, significantPairs } from './evidence/evidence.mjs';
import { readHistory } from './evidence/git-history.mjs';
import { moduleResolver } from './evidence/production-files.mjs';
import { coChangeSettings } from './settings.mjs';

export function projectEvidence({ projectRoot, policy = {}, ref = 'HEAD' }) {
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
