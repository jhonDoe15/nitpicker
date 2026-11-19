import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { pathInside, projectSourceFiles } from '../java-sources.mjs';
import { parseSource } from '../max-value-sums/source-file.mjs';
import { findFallThroughs } from './branches.mjs';

export const NULL_FALL_THROUGH_RULE = 'NullBranchFallThrough';
export const NULL_FALL_THROUGH_EXCEPTION_RULE = `pmd/${NULL_FALL_THROUGH_RULE}`;

function fallThroughMessage(name, kotlin, use) {
  const target = use === undefined ? 'code that uses' : `\`${use}\`, which uses`;
  const form = kotlin ? 'an `else`, `return` or `throw`' : '`return` (or an `else`)';
  return (
    `The null branch handles \`${name}\` and then falls through to ${target} \`${name}\`; ` +
    `add ${form} so the null case is handled once.`
  );
}

export function readNullFallThroughFindings(
  projectRoot,
  { projects, kotlin = false, policy = {} },
) {
  const files = [
    ...projectSourceFiles(projectRoot, { projects, kotlin, exclude: policy.exclude ?? [] }).keys(),
  ];
  const finding = findingFactory();
  return files.flatMap((file) => {
    const isKotlin = file.endsWith('.kt');
    const source = parseSource(readFileSync(pathInside(projectRoot, file), 'utf8'), {
      file,
      kotlin: isKotlin,
    });
    return findFallThroughs(source).map(({ line, use, name, method }) =>
      finding({
        rule: NULL_FALL_THROUGH_RULE,
        file,
        line,
        symbol: name,
        key: `${file}:${method}:${name}`,
        message: fallThroughMessage(name, isKotlin, use),
      }),
    );
  });
}

export const NULL_FALL_THROUGH_ALLOWED = fallThroughMessage('<value>', false);
