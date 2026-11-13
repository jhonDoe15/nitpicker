import { DIFF_ALGORITHM } from '../../../../../core/diff/git/patches/changed-lines.mjs';
import type { Layout } from '../../typed/head-policy.mts';
import type { QualityAreaOptions } from '../typed/area-types.mts';
import {
  gitDiffFromBase,
  globMatcher,
  isInMutationScope,
  parseChangedLines,
  scopedProjectFiles,
} from '../typed/mutation.mts';

type DiffRoots = Pick<QualityAreaOptions, 'baselineRoot' | 'projectRoot'>;

const RANGE_TARGET = /:\d+-\d+$/u;
const GLOB_CHARACTERS = /[()*?[\]{}]/gu;

export const MUTATION_REPORT_PATH = 'reports/quality/mutation/mutation.json';

export function diffAgainstBase({ baselineRoot, projectRoot }: DiffRoots, format: string): string {
  return gitDiffFromBase(baselineRoot ?? '', projectRoot, [
    format,
    DIFF_ALGORITHM,
    '--find-renames',
    '--relative',
    '--no-color',
    '--no-ext-diff',
  ]);
}

function scopedSourceFiles(
  projectRoot: string,
  mutationScope: readonly string[],
  layout: Layout,
): string[] {
  return scopedProjectFiles(projectRoot, mutationScope).filter((file) => layout.isSourceFile(file));
}

export function mutationTargets(options: QualityAreaOptions, layout: Layout): string[] | undefined {
  if (options.snapshot === 'base') {
    return [];
  }
  if (options.baselineRoot === undefined) {
    return options.mutationScope === undefined
      ? undefined
      : scopedSourceFiles(options.projectRoot, options.mutationScope, layout);
  }
  return [...parseChangedLines(diffAgainstBase(options, '--unified=0')).values()]
    .filter((file) => layout.isSourceFile(file.path))
    .filter((file) => isInMutationScope(file.path, options.mutationScope))
    .flatMap((file) =>
      file.ranges.map(([start, end]) => `${file.path}:${String(start)}-${String(end)}`),
    );
}

function mutatedByPatterns(patterns: readonly string[], file: string): boolean {
  return patterns.reduce((mutated, pattern) => {
    const negated = pattern.startsWith('!');
    return globMatcher(negated ? pattern.slice(1) : pattern).test(file) ? !negated : mutated;
  }, false);
}

function literalTarget(target: string): string {
  const range = RANGE_TARGET.exec(target)?.[0] ?? '';
  const file = target.slice(0, target.length - range.length);
  return `${file.replaceAll(GLOB_CHARACTERS, (character) => `[${character}]`)}${range}`;
}

export function configuredTargets(
  targets: readonly string[],
  patterns: readonly string[] | undefined,
): string[] {
  return targets
    .filter(
      (target) =>
        patterns === undefined || RANGE_TARGET.test(target) || mutatedByPatterns(patterns, target),
    )
    .map(literalTarget);
}
