import path from 'node:path';
import { isCompilerRejection } from '../oxlint-diagnostics.mts';
import { type LintResult, lintResultsOf } from '../plan/oxlint-shapes.mts';

export type FileLinter = (patterns: readonly string[]) => Promise<unknown>;

function isRejected(result: LintResult): boolean {
  return result.messages.some(isCompilerRejection);
}

export async function withRejectedFilesRelinted(
  results: readonly LintResult[],
  { projectRoot, lintFiles }: { readonly projectRoot: string; readonly lintFiles: FileLinter },
): Promise<LintResult[]> {
  const rejected = new Set(results.filter(isRejected).map(({ filePath }) => filePath));
  if (rejected.size === 0) {
    return [...results];
  }
  const patterns = [...rejected].map((file) =>
    path.relative(projectRoot, file).replaceAll('\\', '/'),
  );
  const relinted = lintResultsOf(await lintFiles(patterns.toSorted()));
  return [...results.filter(({ filePath }) => !rejected.has(filePath)), ...relinted].toSorted(
    (left, right) => left.filePath.localeCompare(right.filePath),
  );
}
