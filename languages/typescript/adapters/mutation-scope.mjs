import { parseChangedLines, runGit } from '../../../core/diff/git.mjs';

export const MUTATION_REPORT_PATH = 'reports/quality/mutation/mutation.json';

export function mutationTargets({ snapshot, baselineRoot, projectRoot }, layout) {
  if (snapshot === 'base') return [];
  if (baselineRoot === undefined) return undefined;
  const baseCommit = runGit(baselineRoot, ['rev-parse', 'HEAD']).trim();
  const diff = runGit(projectRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--unified=0',
    '--find-renames',
    '--relative',
    '--no-color',
    '--no-ext-diff',
    baseCommit,
    'HEAD',
  ]);
  return [...parseChangedLines(diff).values()]
    .filter((file) => layout.isSourceFile(file.path))
    .flatMap((file) =>
      file.ranges.map(([start, end]) => `${file.path}:${String(start)}-${String(end)}`),
    );
}
