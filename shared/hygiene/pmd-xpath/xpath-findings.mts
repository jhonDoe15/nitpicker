import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { exceptionHint } from '../rules.mts';
import { predicateScans, severalNodeUses } from './xpath-mistakes.mts';
import { projectXPathRules } from './xpath-source.mts';
import type { XPathRule } from './xpath-source.mts';
import type { RepositoryContext } from '../check-types.mts';
import type { Finding } from '../../values/findings.mts';

function problems({ xpath }: XPathRule): string[] {
  const scans = predicateScans(xpath);
  const several = severalNodeUses(xpath);
  return [
    ...(scans.length === 0
      ? []
      : [
          `it scans from the document root inside a predicate (${scans.join(', ')}), which is evaluated again for every candidate node; bind the nodes once or walk from the candidate`,
        ]),
    ...(several.length === 0
      ? []
      : [
          `it applies a single-item function or \`eq\`/\`ne\` to ${several.join(', ')}, which selects several nodes in a method with more than one; PMD then raises a type error and skips the rule for that file. Pick one node with \`[1]\`, guard with \`count(...) = 1\`, or use \`=\` or \`some\``,
        ]),
  ];
}

export function pmdXPathMistakeFindings(
  tool: string,
  { projectRoot, files }: Pick<RepositoryContext, 'projectRoot' | 'files'>,
): Finding[] {
  const id = HYGIENE_RULE_IDS.pmdXpathRuleMistake;
  return projectXPathRules(projectRoot, files).flatMap((entry) => {
    const found = problems(entry);
    return found.length === 0
      ? []
      : [
          {
            tool,
            rule: id,
            path: entry.file,
            identity: `${entry.file}|${id}|${entry.rule}`,
            message: `The XPath rule ${entry.rule} in ${entry.file}: ${found.join('. Also, ')}. ${exceptionHint(id, entry.file)}`,
            classification: 'enforceable',
          },
        ];
  });
}
