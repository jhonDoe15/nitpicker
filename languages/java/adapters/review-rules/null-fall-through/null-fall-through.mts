import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { mainSourceTexts } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source-file.mts';
import { findFallThroughs } from './branches.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';

export const NULL_FALL_THROUGH_RULE = 'NullBranchFallThrough';
export const NULL_FALL_THROUGH_EXCEPTION_RULE = `pmd/${NULL_FALL_THROUGH_RULE}`;

function fallThroughMessage(name: string, kotlin: boolean, use?: string): string {
  const target = use === undefined ? 'code that uses' : `\`${use}\`, which uses`;
  const form = kotlin ? 'an `else`, `return` or `throw`' : '`return` (or an `else`)';
  return (
    `The null branch handles \`${name}\` and then falls through to ${target} \`${name}\`; ` +
    `add ${form} so the null case is handled once.`
  );
}

export function readNullFallThroughFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  return mainSourceTexts(projectRoot, options).flatMap(({ file, text, kotlin }) =>
    findFallThroughs(parseSource(text, { file, kotlin })).map(({ line, use, name, method }) =>
      finding({
        rule: NULL_FALL_THROUGH_RULE,
        file,
        line,
        symbol: name,
        key: `${file}:${method}:${name}`,
        message: fallThroughMessage(name, kotlin, use),
      }),
    ),
  );
}

export const NULL_FALL_THROUGH_ALLOWED = fallThroughMessage('<value>', false);
