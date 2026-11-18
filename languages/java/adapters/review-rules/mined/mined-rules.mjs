import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { pathInside, projectSourceFiles } from '../java-sources.mjs';
import { parseSource } from '../max-value-sums/source-file.mjs';
import { affixBoundaryRule } from '../affix-boundaries/affix-boundaries.mjs';
import { preconditionMessageRule } from '../precondition-messages/precondition-messages.mjs';
import { unpagedListingRule } from '../object-listings/object-listings.mjs';
import { queryTextRule } from '../query-text/query-text.mjs';
import { caseLookupRule } from '../case-lookups/case-lookups.mjs';
import { affixReplaceRule } from '../affix-replace/affix-replace.mjs';

export const MINED_RULES = [
  affixBoundaryRule,
  affixReplaceRule,
  caseLookupRule,
  preconditionMessageRule,
  queryTextRule,
  unpagedListingRule,
];
export const MINED_EXCEPTION_RULES = MINED_RULES.map(({ id }) => `pmd/${id}`);

export function readMinedFindings(projectRoot, { projects, kotlin = false, policy = {} }) {
  const files = [
    ...projectSourceFiles(projectRoot, { projects, kotlin, exclude: policy.exclude ?? [] }).keys(),
  ];
  const finding = findingFactory();
  return files.flatMap((file) => {
    const isKotlin = file.endsWith('.kt');
    const text = readFileSync(pathInside(projectRoot, file), 'utf8');
    const source = parseSource(text, { file, kotlin: isKotlin });
    return MINED_RULES.flatMap((rule) =>
      rule.find(source).map((item) =>
        finding({
          rule: rule.id,
          file,
          line: item.line,
          symbol: item.symbol,
          key: `${file}:${item.key}`,
          message: rule.message(item, isKotlin),
        }),
      ),
    );
  });
}
