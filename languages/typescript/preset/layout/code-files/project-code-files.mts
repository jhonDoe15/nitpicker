import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CodeFileLayout } from '../layout-types.mts';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../shared/project-files/project-files.mjs';
export const DEPENDENCY_PATH_PATTERN = '(?:^|/)node_modules(?:/|$)';
const DEPENDENCY_PATH = new RegExp(DEPENDENCY_PATH_PATTERN);
const projectFilesUnder: (
  root: string,
  options: { skipDirectory: (absolute: string) => boolean },
) => string[] = untypedProjectFilesUnder;

export function codeFilesUnder(
  layout: CodeFileLayout,
  projectRoot: string,
  roots: readonly string[],
): string[] {
  const walked = roots.includes('.') ? ['.'] : [...new Set(roots)];
  return walked.flatMap((root) => codeFilesUnderRoot(layout, projectRoot, root).toSorted());
}

function codeFilesUnderRoot(layout: CodeFileLayout, projectRoot: string, root: string): string[] {
  function relativeOf(absolute: string): string {
    return path.relative(projectRoot, absolute).replaceAll('\\', '/');
  }
  const directory = directoryUnder(projectRoot, root);
  return [
    ...projectFilesUnder(directory, {
      skipDirectory: (absolute: string) => DEPENDENCY_PATH.test(relativeOf(absolute)),
    }),
  ]
    .map(relativeOf)
    .filter((name) => !layout.isGeneratedPath(name) && isCodeFile(layout, name));
}

function isCodeFile(layout: CodeFileLayout, name: string): boolean {
  return (layout.isSourceFile(name) || layout.isTestFile(name)) && !layout.isExcluded(name);
}

function directoryUnder(projectRoot: string, root: string): string {
  const projectDirectory = path.resolve(projectRoot);
  const directory = path.resolve(projectDirectory, root);
  if (directory !== projectDirectory && !directory.startsWith(`${projectDirectory}${path.sep}`)) {
    throw new Error(`Source root is outside the project: ${root}`);
  }
  return directory;
}

export function existingRoots(projectRoot: string, roots: readonly string[]): string[] {
  return roots.filter((root) => existsSync(directoryUnder(projectRoot, root)));
}
