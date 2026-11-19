import { findingFactory } from '../../kotlin/review-rules/finding/review-finding.mts';
import { mainSourceTexts } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source/source-file.mts';
import type {
  FindingFactory,
  ReviewFinding,
} from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';
import type { SourceFile } from '../max-value-sums/sum-types.mts';

export type ParsedMainSource = {
  readonly file: string;
  readonly kotlin: boolean;
  readonly source: SourceFile;
  readonly finding: FindingFactory;
};

export function findingsFromSources(
  projectRoot: string,
  options: MainSourceOptions,
  read: (parsed: ParsedMainSource) => ReviewFinding[],
): ReviewFinding[] {
  const finding = findingFactory();
  return mainSourceTexts(projectRoot, options).flatMap(({ file, text, kotlin }) =>
    read({ file, kotlin, source: parseSource(text, { file, kotlin }), finding }),
  );
}
