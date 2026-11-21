import { HYGIENE_RULE_IDS } from '../../../project-rules/hygiene-rules.mts';
import { collectRepositoryFindings } from '../../../hygiene/files/repository-files.mts';
import { withoutExcepted, withoutExcluded } from '../../../hygiene/rules.mts';
import { trackedFiles } from '../../../hygiene/tracked-files.mts';
import type { HygienePolicy } from '../../../hygiene/check-types.mts';
import type { Finding } from '../../../values/findings.mts';

export const UNTRACK_RULES: readonly string[] = [
  HYGIENE_RULE_IDS.committedEnvFile,
  HYGIENE_RULE_IDS.committedBuildOutput,
  HYGIENE_RULE_IDS.committedBinary,
  HYGIENE_RULE_IDS.committedPrivateKey,
];

export function hygieneInputs({
  projectRoot,
  policy = {},
}: {
  readonly projectRoot: string;
  readonly policy?: HygienePolicy;
}): { readonly findings: Finding[] } {
  const files = withoutExcluded(trackedFiles(projectRoot), policy.exclude);
  const findings = withoutExcepted(
    collectRepositoryFindings({ projectRoot, files }),
    policy.exceptions,
  );
  return { findings: findings.filter(({ rule }) => UNTRACK_RULES.includes(rule)) };
}
