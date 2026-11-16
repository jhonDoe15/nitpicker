import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { pathInside, projectSourceFiles } from '../java-sources.mjs';
import { collectCarriers } from './carriers.mjs';
import { parseSource } from './source-file.mjs';
import { findSums } from './sums.mjs';

export const MAX_VALUE_RULE = 'MaxValueOverflow';
export const MAX_VALUE_EXCEPTION_RULE = `pmd/${MAX_VALUE_RULE}`;
const LIMITS = { int: 'Integer.MAX_VALUE', long: 'Long.MAX_VALUE' };

function maxValueMessage({ expression, name, kind, kotlin }) {
  const widen = kotlin ? '`start.toLong() + width`' : '`(long) start + width`';
  return (
    `\`${name}\` can hold ${LIMITS[kind]} (a "no limit" value), so \`${expression}\` overflows to a negative number ` +
    `that is then used as an index, length, bound or comparison. Compare without adding (\`width >= length - start\`), ` +
    `widen first (${widen}), use \`Math.addExact\`, or check the sentinel before the arithmetic ` +
    `(\`if (${name} == ${LIMITS[kind]}) ...\`).`
  );
}

export function readMaxValueFindings(projectRoot, { projects, kotlin = false, policy = {} }) {
  const files = [
    ...projectSourceFiles(projectRoot, { projects, kotlin, exclude: policy.exclude ?? [] }).keys(),
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
