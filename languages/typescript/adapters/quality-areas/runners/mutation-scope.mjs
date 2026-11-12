import {
  DIFF_ALGORITHM,
  parseChangedLines,
} from '../../../../../core/diff/git/patches/changed-lines.mjs';
import { runGit } from '../../../../../core/diff/git/repository/command.mjs';
import { diffFromBase } from '../../../../../core/tooling/git/base-diff.mjs';
import {
  isInMutationScope,
  scopedProjectFiles,
} from '../../../../../core/scope/mutation-scope.mjs';
import { globMatcher } from '../../../../../shared/paths/glob.mjs';

const RANGE_TARGET = /:\d+-\d+$/u;
const GLOB_CHARACTERS = /[()*?[\]{}]/gu;

export const MUTATION_REPORT_PATH = 'reports/quality/mutation/mutation.json';

export function diffAgainstBase({ baselineRoot, projectRoot }, format) {
  return diffFromBase({
    runGit,
    baselineRoot,
    projectRoot,
    args: [format, DIFF_ALGORITHM, '--find-renames', '--relative', '--no-color', '--no-ext-diff'],
  });
}

function scopedSourceFiles({ projectRoot, mutationScope }, layout) {
  return scopedProjectFiles(projectRoot, mutationScope).filter((file) => layout.isSourceFile(file));
}

export function mutationTargets(options, layout) {
  if (options.snapshot === 'base') return [];
  if (options.baselineRoot === undefined) {
    return options.mutationScope === undefined ? undefined : scopedSourceFiles(options, layout);
  }
  return [...parseChangedLines(diffAgainstBase(options, '--unified=0')).values()]
    .filter((file) => layout.isSourceFile(file.path))
    .filter((file) => isInMutationScope(file.path, options.mutationScope))
    .flatMap((file) =>
      file.ranges.map(([start, end]) => `${file.path}:${String(start)}-${String(end)}`),
    );
}

function mutatedByPatterns(patterns, file) {
  return patterns.reduce((mutated, pattern) => {
    const negated = pattern.startsWith('!');
    return globMatcher(negated ? pattern.slice(1) : pattern).test(file) ? !negated : mutated;
  }, false);
}

function literalTarget(target) {
  const range = RANGE_TARGET.exec(target)?.[0] ?? '';
  const file = target.slice(0, target.length - range.length);
  return `${file.replaceAll(GLOB_CHARACTERS, (character) => `[${character}]`)}${range}`;
}

export function configuredTargets(targets, patterns) {
  return targets
    .filter(
      (target) =>
        patterns === undefined || RANGE_TARGET.test(target) || mutatedByPatterns(patterns, target),
    )
    .map(literalTarget);
}
