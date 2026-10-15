import { parseChangedLines } from '../../../../../core/diff/git/patches/changed-lines.mjs';
import { runGit } from '../../../../../core/diff/git/repository/command.mjs';

export const MUTATION_REPORT_PATH = 'reports/quality/mutation/mutation.json';

export function diffAgainstBase({ baselineRoot, projectRoot }, format) {
  const baseCommit = runGit(baselineRoot, ['rev-parse', 'HEAD']).trim();
  return runGit(projectRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    format,
    '--find-renames',
    '--relative',
    '--no-color',
    '--no-ext-diff',
    baseCommit,
    'HEAD',
  ]);
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
