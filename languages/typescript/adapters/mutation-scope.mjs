import { parseChangedLines } from '../../../core/diff/git.mjs';
import { diffFromBase } from '../../../core/tooling/git/base-diff.mjs';

export const MUTATION_REPORT_PATH = 'reports/quality/mutation/mutation.json';

export function mutationTargets({ snapshot, baselineRoot, projectRoot }, layout) {
  if (snapshot === 'base') return [];
  if (baselineRoot === undefined) return undefined;
  const diff = diffFromBase({
    baselineRoot,
    projectRoot,
    args: ['--unified=0', '--find-renames', '--relative', '--no-color', '--no-ext-diff'],
  });
  return [...parseChangedLines(diff).values()]
    .filter((file) => layout.isSourceFile(file.path))
    .flatMap((file) =>
      file.ranges.map(([start, end]) => `${file.path}:${String(start)}-${String(end)}`),
    );
}
