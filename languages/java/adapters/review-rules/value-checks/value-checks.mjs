import { readFileSync } from 'node:fs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { pathInside, projectSourceFiles } from '../java-sources.mjs';
import { parseSource } from '../max-value-sums/source-file.mjs';
import { NAN_GUARD_CHECK } from './nan-guard/nan-guard.mjs';
import { NEGATIVE_COUNT_CHECK } from './negative-count/negative-count.mjs';
import { INDEX_BOUND_CHECK } from './index-bound/index-bound.mjs';
import { RESPONSE_BODY_CHECK } from './response-body/response-body.mjs';

export const VALUE_CHECKS = [
  RESPONSE_BODY_CHECK,
  NAN_GUARD_CHECK,
  NEGATIVE_COUNT_CHECK,
  INDEX_BOUND_CHECK,
];

export const VALUE_CHECK_EXCEPTION_RULES = VALUE_CHECKS.map(({ rule }) => `pmd/${rule}`);

export function valueCheckFindings(source, finding, file) {
  return VALUE_CHECKS.flatMap((check) =>
    check.find(source).map((found) =>
      finding({
        rule: check.rule,
        file,
        line: found.line,
        symbol: found.name,
        key: `${file}:${found.method ?? ''}:${found.name}`,
        message: check.message(found, source.kotlin),
      }),
    ),
  );
}

export function readValueCheckFindings(projectRoot, { projects, kotlin = false, policy = {} }) {
  const files = [
    ...projectSourceFiles(projectRoot, { projects, kotlin, exclude: policy.exclude ?? [] }).keys(),
  ];
  const finding = findingFactory();
  return files.flatMap((file) => {
    const source = parseSource(readFileSync(pathInside(projectRoot, file), 'utf8'), {
      file,
      kotlin: file.endsWith('.kt'),
    });
    return valueCheckFindings(source, finding, file);
  });
}
