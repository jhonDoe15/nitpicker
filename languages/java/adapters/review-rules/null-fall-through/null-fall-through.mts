import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { pathInside, projectSourceFiles } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source-file.mts';
import { findFallThroughs } from './branches.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { SourceProject } from '../review-types.mts';

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
  {
    projects,
    kotlin,
    policy = {},
  }: {
    projects: readonly SourceProject[];
    kotlin: boolean;
    policy?: { readonly exclude?: readonly string[] };
  },
): ReviewFinding[] {
  const files = [
    ...projectSourceFiles(projectRoot, {
      projects,
      kotlin,
      exclude: policy.exclude ?? [],
      test: false,
    }).keys(),
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
