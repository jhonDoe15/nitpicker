import path from 'node:path';
import type { FileLibraryContext, ProjectLibraries } from './typed/library-types.mts';
import { mergeLibraries, ROOT_PACKAGE } from './project-libraries.mts';

function directoriesToRoot(
  filename: string | undefined,
  projectRoot: string | undefined,
): string[] {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || !projectRoot) {
    return [];
  }
  const relative = path.relative(path.resolve(projectRoot), path.dirname(filename));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return [];
  }
  const segments = relative === '' ? [] : relative.split(path.sep);
  return [
    ROOT_PACKAGE,
    ...segments.map((_, index) => segments.slice(0, index + 1).join('/')),
  ].reverse();
}

export function librariesForFile(
  { filename, cwd }: FileLibraryContext,
  libraries: ProjectLibraries | undefined,
): ProjectLibraries | undefined {
  const packages = libraries?.packages ?? {};
  const found = directoriesToRoot(filename, cwd)
    .map((directory) => packages[directory])
    .filter((entry) => entry !== undefined);
  return found.length === 0 ? libraries : mergeLibraries(found);
}
