import { parseChangedLines } from '../../../../../core/diff/git/patches/changed-lines.mjs';
import { runGit } from '../../../../../core/diff/git/repository/command.mjs';
import { diffFromBase } from '../../../../../core/tooling/git/base-diff.mjs';

export const MUTATION_REPORT_PATH = 'reports/quality/mutation/mutation.json';

export function diffAgainstBase({ baselineRoot, projectRoot }, format) {
  return diffFromBase({
    runGit,
    baselineRoot,
    projectRoot,
    args: [format, '--find-renames', '--relative', '--no-color', '--no-ext-diff'],
  });
}

export function mutationTargets(options, layout) {
  if (options.snapshot === 'base') return [];
  if (options.baselineRoot === undefined) return undefined;
  return [...parseChangedLines(diffAgainstBase(options, '--unified=0')).values()]
    .filter((file) => layout.isSourceFile(file.path))
    .flatMap((file) =>
      file.ranges.map(([start, end]) => `${file.path}:${String(start)}-${String(end)}`),
    );
}
