import { HYGIENE_RULE_IDS } from '../../../project-rules/hygiene-rules.mjs';
import { collectRepositoryFindings } from '../../../hygiene/files/repository-files.mjs';
import { withoutExcepted, withoutExcluded } from '../../../hygiene/rules.mjs';
import { trackedFiles } from '../../../hygiene/tracked-files.mjs';

export const UNTRACK_RULES = [
  HYGIENE_RULE_IDS.committedEnvFile,
  HYGIENE_RULE_IDS.committedBuildOutput,
  HYGIENE_RULE_IDS.committedBinary,
  HYGIENE_RULE_IDS.committedPrivateKey,
];

export function hygieneInputs({ projectRoot, policy = {} }) {
  const files = withoutExcluded(trackedFiles(projectRoot), policy.exclude);
  const findings = withoutExcepted(
    collectRepositoryFindings({ projectRoot, files }),
    policy.exceptions,
  );
  return { findings: findings.filter(({ rule }) => UNTRACK_RULES.includes(rule)) };
}
