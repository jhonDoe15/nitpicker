import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import {
  isInsideRoot,
  isProjectRoot,
  relativeToRoot,
  sourcePathUnder,
  underRoot,
} from './source-root/root-paths.mts';
import type { FilePatterns } from './layout-types.mts';
import type { LayoutClassifiers } from '../typed/layout-types.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

export function toPosix(file: string): string {
  return file.replaceAll('\\', '/');
}

export function sourceUnderRootClassifier({
  sourceRoot,
  isSourceFile,
  isExcluded,
}: Pick<LayoutClassifiers, 'isSourceFile' | 'isExcluded'> & {
  sourceRoot: string;
}): (file: string, root: string) => boolean {
  return (file, root) => {
    const normalized = toPosix(file);
    const base = toPosix(root).replace(/\/$/, '');
    return (
      isInsideRoot(normalized, base) &&
      isSourceFile(underRoot(sourceRoot, relativeToRoot(normalized, base))) &&
      !isExcluded(normalized)
    );
  };
}

export function testInputPattern(testRoots: readonly string[]): (name: string) => RegExp {
  const locations = ['__tests__', ...testRoots].map(escapeRegExp).join('|');
  return (name) =>
    new RegExp(`(?:^|/)(?:${locations})/(?:.*/)?(?:__fixtures__|fixtures)/${escapeRegExp(name)}`);
}

export function testFileClassifier(
  patterns: FilePatterns,
  isRunnerTest: (file: string) => boolean,
): (file: string) => boolean {
  return (file) => {
    const normalized = toPosix(file);
    if (!patterns.codePattern.test(normalized) || normalized.endsWith('.d.ts')) {
      return false;
    }
    return (
      patterns.testPattern.test(normalized) ||
      (patterns.sourcePattern.test(normalized) && isRunnerTest(normalized))
    );
  };
}

export function sourceRootLookups({
  sourceRoots,
  isGeneratedPath,
  isExcluded,
}: Pick<LayoutClassifiers, 'isGeneratedPath' | 'isExcluded'> & {
  sourceRoots: readonly string[];
}): Pick<LayoutClassifiers, 'sourceRootOf' | 'sourcePathOf'> {
  return {
    sourceRootOf: (file) =>
      sourceRoots.find((root) => !isProjectRoot(root) && file.includes(`/${root}/`)),
    sourcePathOf: (file) => {
      const found = sourcePathUnder(sourceRoots, file);
      const hidden = found !== undefined && (isGeneratedPath(found) || isExcluded(found));
      return hidden && sourceRoots.some((root) => isProjectRoot(root)) ? undefined : found;
    },
  };
}
