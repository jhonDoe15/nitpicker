import { globMatcher } from '../../typed/runner/exception-views.mts';
import { isGeneratedPython } from '../../../libraries/generated-files.mts';
import { pythonSourceFiles } from '../python-sources.mts';

export function designFiles(
  {
    projectRoot,
    project,
    exclude = [],
  }: {
    projectRoot: string;
    project: { sourceRoots: readonly string[] };
    exclude?: readonly string[];
  },
  sources: readonly string[],
): string[] {
  const inSourceRoots = new Set(pythonSourceFiles(projectRoot, project.sourceRoots));
  const excluded = exclude.map((glob) => globMatcher(glob));
  return sources.filter(
    (file) =>
      inSourceRoots.has(file) &&
      !excluded.some((matcher) => matcher.test(file)) &&
      !isGeneratedPython(projectRoot, file),
  );
}
