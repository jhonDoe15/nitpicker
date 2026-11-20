import { findingFactory } from '../../kotlin/review-rules/finding/review-finding.mts';
import { mainSourceTexts } from '../java-sources.mts';
import type { MainSourceOptions } from '../java-sources.mts';
import type { MinedRule } from '../review-types.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import { parseSource } from '../max-value-sums/source/source-file.mts';
import { affixBoundaryRule } from '../affix-boundaries/affix-boundaries.mts';
import { preconditionMessageRule } from '../precondition-messages/precondition-messages.mts';
import { unpagedListingRule } from '../object-listings/object-listings.mts';
import { queryTextRule } from '../query-text/query-text.mts';
import { caseLookupRule } from '../case-lookups/case-lookups.mts';
import { affixReplaceRule } from '../affix-replace/affix-replace.mts';

const MINED_RULES: readonly MinedRule[] = [
  affixBoundaryRule,
  affixReplaceRule,
  caseLookupRule,
  preconditionMessageRule,
  queryTextRule,
  unpagedListingRule,
];
export const MINED_EXCEPTION_RULES = MINED_RULES.map(({ id }) => `pmd/${id}`);

export function readMinedFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  return mainSourceTexts(projectRoot, options).flatMap(({ file, text, kotlin }) => {
    const source = parseSource(text, { file, kotlin });
    return MINED_RULES.flatMap((rule) =>
      rule.find(source).map((item) =>
        finding({
          rule: rule.id,
          file,
          line: item.line,
          symbol: item.symbol,
          key: `${file}:${item.key}`,
          message: rule.message(item, kotlin),
        }),
      ),
    );
  });
}
