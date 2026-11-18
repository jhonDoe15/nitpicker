import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { pathInside, projectSourceFiles } from '../java-sources.mts';
import { collectCarriers } from './carriers.mts';
import { parseSource } from './source-file.mts';
import { findSums } from './sums.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { SourceProject } from '../review-types.mts';
import type { NumberKind } from './sum-types.mts';

export const MAX_VALUE_RULE = 'MaxValueOverflow';
export const MAX_VALUE_EXCEPTION_RULE = `pmd/${MAX_VALUE_RULE}`;
const LIMITS: Readonly<Record<NumberKind, string>> = {
  int: 'Integer.MAX_VALUE',
  long: 'Long.MAX_VALUE',
};

function maxValueMessage({
  expression,
  name,
  kind,
  kotlin,
}: {
  expression: string;
  name: string;
  kind: NumberKind;
  kotlin: boolean;
}): string {
  const widen = kotlin ? '`start.toLong() + width`' : '`(long) start + width`';
  return (
    `\`${name}\` can hold ${LIMITS[kind]} (a "no limit" value), so \`${expression}\` overflows to a negative number ` +
    `that is then used as an index, length, bound or comparison. Compare without adding (\`width >= length - start\`), ` +
    `widen first (${widen}), use \`Math.addExact\`, or check the sentinel before the arithmetic ` +
    `(\`if (${name} == ${LIMITS[kind]}) ...\`).`
  );
}

export function readMaxValueFindings(
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
  const sources = files.map((file) =>
    parseSource(readFileSync(pathInside(projectRoot, file), 'utf8'), {
      file,
      kotlin: file.endsWith('.kt'),
    }),
  );
  const state = collectCarriers(sources);
  const finding = findingFactory();
  return sources.flatMap((source) =>
    findSums(state, source).map(({ line, operand, text }) =>
      finding({
        rule: MAX_VALUE_RULE,
        file: source.file,
        line,
        symbol: operand.name,
        key: `${source.file}:${text}`,
        message: maxValueMessage({
          expression: text,
          name: operand.name,
          kind: operand.kind,
          kotlin: source.kotlin,
        }),
      }),
    ),
  );
}

export const MAX_VALUE_ALLOWED = maxValueMessage({
  expression: '<start> + <width>',
  name: '<width>',
  kind: 'int',
  kotlin: false,
});
