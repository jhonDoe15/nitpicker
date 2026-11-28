import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { exceptionHint } from '../rules.mts';
import { everywhereSuppressions } from './checkstyle-suppressions.mts';
import type { EverywhereSuppression } from './checkstyle-suppressions.mts';
import { pmdEverywhereSuppressions } from './pmd-suppressions.mts';
import type { RepositoryContext } from '../check-types.mts';
import type { Finding } from '../../values/findings.mts';

function message(entry: EverywhereSuppression, tool: 'Checkstyle' | 'PMD'): string {
  const names = entry.modules.join(', ');
  const rule = HYGIENE_RULE_IDS.lintCheckSuppressedEverywhere;
  const cause =
    tool === 'Checkstyle'
      ? `${entry.file} suppresses ${names} for every file while ${entry.config} still enables it`
      : `${entry.file} includes ${names} and discards its findings for every file`;
  return `${cause}. The ${tool} check still runs on every file and can never report anything, so it only costs time. Remove it from the configuration instead of filtering its output. ${exceptionHint(rule, entry.file)}`;
}

export function lintSuppressedEverywhereFindings(
  tool: string,
  { projectRoot, files }: Pick<RepositoryContext, 'projectRoot' | 'files'>,
): Finding[] {
  const rule = HYGIENE_RULE_IDS.lintCheckSuppressedEverywhere;
  const entries = [
    ...everywhereSuppressions(projectRoot, files).map((entry) => ({ entry, kind: 'Checkstyle' })),
    ...pmdEverywhereSuppressions(projectRoot, files).map((entry) => ({ entry, kind: 'PMD' })),
  ] as const;
  return entries.map(({ entry, kind }) => ({
    tool,
    rule,
    path: entry.file,
    identity: `${entry.file}|${rule}|${entry.modules.join(',')}`,
    message: message(entry, kind === 'PMD' ? 'PMD' : 'Checkstyle'),
    classification: 'enforceable',
  }));
}
