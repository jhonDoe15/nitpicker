import { findingFactory } from '../../kotlin/review-rules/finding/review-finding.mts';
import { mainSourceTexts } from '../java-sources.mts';
import type { MainSourceOptions } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source/source-file.mts';
import type { ValueCheck, ValueFound } from './scan.mts';
import type {
  FindingFactory,
  ReviewFinding,
} from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { SourceFile } from '../max-value-sums/sum-types.mts';
import { NAN_GUARD_CHECK } from './nan-guard/nan-guard.mts';
import { NEGATIVE_COUNT_CHECK } from './negative-count/negative-count.mts';
import { INDEX_BOUND_CHECK } from './index-bound/index-bound.mts';
import { BACKOFF_CHECK } from './backoff/backoff.mts';
import { WALL_CLOCK_CHECK } from './wall-clock/wall-clock.mts';
import { RESPONSE_BODY_CHECK } from './response-body/response-body.mts';

type Reported = {
  readonly rule: string;
  readonly allowed: string;
  readonly report: (source: SourceFile) => { found: ValueFound; message: string }[];
};

function reported<Found extends ValueFound>(check: ValueCheck<Found>): Reported {
  return {
    rule: check.rule,
    allowed: check.allowed,
    report: (source) =>
      check.find(source).map((found) => ({ found, message: check.message(found, source.kotlin) })),
  };
}

export const VALUE_CHECKS: Reported[] = [
  reported(RESPONSE_BODY_CHECK),
  reported(NAN_GUARD_CHECK),
  reported(NEGATIVE_COUNT_CHECK),
  reported(INDEX_BOUND_CHECK),
  reported(BACKOFF_CHECK),
  reported(WALL_CLOCK_CHECK),
];

export const VALUE_CHECK_EXCEPTION_RULES = VALUE_CHECKS.map(({ rule }) => `pmd/${rule}`);

function valueCheckFindings(
  source: SourceFile,
  { finding, file }: { finding: FindingFactory; file: string },
): ReviewFinding[] {
  return VALUE_CHECKS.flatMap((check) =>
    check.report(source).map(({ found, message }) =>
      finding({
        rule: check.rule,
        file,
        line: found.line,
        symbol: found.name,
        key: `${file}:${found.method}:${found.name}`,
        message,
      }),
    ),
  );
}

export function readValueCheckFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  return mainSourceTexts(projectRoot, options).flatMap(({ file, text, kotlin }) =>
    valueCheckFindings(parseSource(text, { file, kotlin }), { finding, file }),
  );
}
