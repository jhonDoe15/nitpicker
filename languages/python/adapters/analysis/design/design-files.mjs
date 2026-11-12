import { globMatcher } from '../../../../../shared/paths/glob.mjs';
import { isGeneratedPython } from '../../../libraries/generated-files.mjs';
import { pythonSourceFiles } from '../python-sources.mjs';

export function designFiles({ projectRoot, project, exclude = [] }, sources) {
  const inSourceRoots = new Set(pythonSourceFiles(projectRoot, project.sourceRoots));
  const excluded = exclude.map((glob) => globMatcher(glob));
  return sources.filter(
    (file) =>
      inSourceRoots.has(file) &&
      !excluded.some((matcher) => matcher.test(file)) &&
      !isGeneratedPython(projectRoot, file),
  );
}
