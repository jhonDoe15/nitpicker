import { readdirSync, writeFileSync, type Dirent } from 'node:fs';
import path from 'node:path';
import {
  PYTHON_SKIPPED_FOLDERS,
  skippedFolderGlobs as untypedSkippedFolderGlobs,
} from '../../../../core/tooling/jscpd/skipped-folders.mjs';
import { projectFilesUnder, sourceLines } from './typed/shared-views.mts';
import {
  DOCUMENTATION_DIRECTORIES,
  importRoots,
  INSTALLED_DIRECTORIES,
  NON_SOURCE_DIRECTORIES,
  NON_SOURCE_FILES,
  TOP_LEVEL_TEST_DIRECTORIES,
} from '../execution/python-project.mts';
import { isGeneratedPython } from '../../libraries/generated-files.mts';
import { isBuildManifest } from '../../../../shared/hygiene/files/build-output.mjs';
import { bddFeatureMatcher, isDirectory } from '../configuration/pytest/bdd-features.mts';
import {
  DJANGO_TEST_FILES,
  isDjangoProject,
  isTestFile,
  testFileOptions,
} from '../configuration/pytest/collection-options.mts';
import type { OtherModule, PythonModule } from './typed/python-graph-types.mts';
import { smallest } from '../../../../shared/lists/lists.mts';

const skippedFolderGlobs: (folders: readonly string[]) => string[] = untypedSkippedFolderGlobs;
export type SourceListing = {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly project: { readonly sourceRoots: readonly string[] };
};

const SOURCE_LISTING = 'python-files.txt';
const WHOLE_PROJECT = '.';
const INSTALLED = new Set(INSTALLED_DIRECTORIES);

function isPythonFile(file: string, { wholeProject }: { wholeProject: boolean }): boolean {
  const name = path.basename(file);
  return name.endsWith('.py') && !(wholeProject && NON_SOURCE_FILES.has(name));
}

function isSkippedDirectory(
  entry: Dirent,
  { wholeProject, topLevel }: { wholeProject: boolean; topLevel: boolean },
): boolean {
  const skipped = wholeProject ? NON_SOURCE_DIRECTORIES : INSTALLED;
  const topLevelTests = topLevel && TOP_LEVEL_TEST_DIRECTORIES.includes(entry.name);
  return entry.name.startsWith('.') || skipped.has(entry.name) || topLevelTests;
}

function relativePosix(projectRoot: string, absolute: string): string {
  return path.relative(projectRoot, absolute).split(path.sep).join('/');
}

export function pythonSourceFiles(projectRoot: string, sourceRoots: readonly string[]): string[] {
  const found = sourceRoots
    .filter((directory) => isDirectory(path.join(projectRoot, directory)))
    .flatMap((directory) => {
      const root = path.join(projectRoot, directory);
      const walked = { wholeProject: directory === WHOLE_PROJECT };
      return projectFilesUnder(root, {
        skipDirectory: (absolute, entry) =>
          isSkippedDirectory(entry, {
            ...walked,
            topLevel: walked.wholeProject && path.dirname(absolute) === path.resolve(root),
          }),
      })
        .filter((file) => isPythonFile(file, walked))
        .map((file) => relativePosix(projectRoot, file));
    });
  return [...new Set(found)].toSorted();
}

export function writeSourceListing({ projectRoot, reportRoot, project }: SourceListing): {
  files: string[];
  listing: string;
} {
  const files = pythonSourceFiles(projectRoot, project.sourceRoots).filter(
    (file) => !isGeneratedPython(projectRoot, file),
  );
  const listing = path.join(reportRoot, SOURCE_LISTING);
  writeFileSync(listing, files.join('\n'));
  return { files, listing };
}

export function functionText(
  sources: Map<string, string[]>,
  projectRoot: string,
  { file, start, end }: { file: string; start: number; end: number },
): string {
  const lines = sourceLines(sources, projectRoot, file)
    .slice(start - 1, end)
    .map((line) => line.trimEnd());
  const indent = smallest(
    lines.filter((line) => line !== '').map((line) => (/^\s*/.exec(line)?.[0] ?? '').length),
  );
  return lines.map((line) => line.slice(indent)).join('\n');
}

const DEPENDENCY_DIRECTORIES = ['__pycache__', 'venv', 'node_modules', 'site-packages'];
const BUILD_OUTPUT_DIRECTORIES = new Set(['build', 'dist']);
const EXCLUDED_DIRECTORIES = [...DEPENDENCY_DIRECTORIES, ...PYTHON_SKIPPED_FOLDERS].filter(
  (name) => !BUILD_OUTPUT_DIRECTORIES.has(name),
);
const HIDDEN_PREFIX = '.';
const COMMON_HIDDEN_DIRECTORIES = [
  '.git',
  '.venv',
  '.tox',
  '.nox',
  '.eggs',
  '.mypy_cache',
  '.ruff_cache',
  '.pytest_cache',
];

const TEST_FILE_GLOBS = ['**/test_*.py', '**/*_test.py', '**/conftest.py'];

function productionGlobs(skippedFolders: readonly string[]): string[] {
  return [
    ...skippedFolderGlobs([
      ...DEPENDENCY_DIRECTORIES,
      ...skippedFolders,
      ...COMMON_HIDDEN_DIRECTORIES,
    ]),
    ...TEST_FILE_GLOBS,
  ];
}

export const NON_PRODUCTION_GLOBS = productionGlobs(PYTHON_SKIPPED_FOLDERS);

export function nonProductionGlobs(
  sourceRoots: readonly string[],
  projectRoot: string,
  skippedFolders: string[] = PYTHON_SKIPPED_FOLDERS,
): string[] {
  const globs =
    skippedFolders === PYTHON_SKIPPED_FOLDERS
      ? NON_PRODUCTION_GLOBS
      : productionGlobs(skippedFolders);
  const topLevel = [...DOCUMENTATION_DIRECTORIES, ...TOP_LEVEL_TEST_DIRECTORIES];
  return [
    ...globs,
    ...(isDjangoProject(projectRoot) ? DJANGO_TEST_FILES.map((name) => `**/${name}`) : []),
    ...(sourceRoots.includes('.') ? topLevel.map((name) => `${name}/**`) : []),
  ];
}

export function existingSourceRoots(projectRoot: string, sourceRoots: readonly string[]): string[] {
  return sourceRoots.filter((root) => isDirectory(path.join(projectRoot, root)));
}

function moduleName(importRoot: string, absoluteFile: string): string {
  const parts = path.relative(importRoot, absoluteFile).replace(/\.py$/, '').split(path.sep);
  return parts.at(-1) === '__init__' ? parts.slice(0, -1).join('.') : parts.join('.');
}

export function testFileMatcher(projectRoot: string): (file: string) => boolean {
  const options = testFileOptions(projectRoot);
  const isBddCode = bddFeatureMatcher(projectRoot);
  return (file: string) => isTestFile(file, options) || isBddCode(file);
}

function holdsBuildOutput(directory: string, projectRoot: string): boolean {
  return (
    path.resolve(directory) === path.resolve(projectRoot) ||
    readdirSync(directory, { withFileTypes: true }).some(
      (entry) => entry.isFile() && isBuildManifest(entry.name),
    )
  );
}

function productionFiles(
  top: string,
  {
    skippedAtTop,
    isTest,
    projectRoot,
  }: { skippedAtTop: string[]; isTest: (file: string) => boolean; projectRoot: string },
): string[] {
  const outputs = new Map<string, boolean>();
  function holdsOutput(directory: string): boolean {
    const held = outputs.get(directory) ?? holdsBuildOutput(directory, projectRoot);
    outputs.set(directory, held);
    return held;
  }
  function isSkipped(absolute: string, entry: Dirent): boolean {
    const parent = path.dirname(absolute);
    return (
      entry.name.startsWith(HIDDEN_PREFIX) ||
      EXCLUDED_DIRECTORIES.includes(entry.name) ||
      (parent === top && skippedAtTop.includes(entry.name)) ||
      (BUILD_OUTPUT_DIRECTORIES.has(entry.name) && holdsOutput(parent))
    );
  }
  return projectFilesUnder(top, { skipDirectory: isSkipped })
    .filter((file) => file.endsWith('.py') && !isTest(file))
    .toSorted();
}

export function listProductionModules(
  projectRoot: string,
  sourceRoots: readonly string[],
): PythonModule[] {
  const seen = new Set<string>();
  const matcher = testFileMatcher(projectRoot);
  function isTest(absolute: string): boolean {
    return matcher(path.relative(projectRoot, absolute).split(path.sep).join('/'));
  }
  return existingSourceRoots(projectRoot, sourceRoots).flatMap((root) => {
    const [importRoot = ''] =
      root === '.' ? [path.resolve(projectRoot)] : importRoots(projectRoot, [root]);
    const skippedAtTop =
      root === '.' ? [...DOCUMENTATION_DIRECTORIES, ...TOP_LEVEL_TEST_DIRECTORIES] : [];
    const top = path.resolve(projectRoot, root);
    return productionFiles(top, { skippedAtTop, isTest, projectRoot }).flatMap((absolute) => {
      const file = path.relative(projectRoot, absolute).split(path.sep).join('/');
      const module = moduleName(importRoot, absolute);
      if (seen.has(module) || module === '') {
        return [];
      }
      seen.add(module);
      return [{ file, module, isPackage: path.basename(file) === '__init__.py' }];
    });
  });
}

const OUTSIDE_SKIPPED = new Set([...INSTALLED_DIRECTORIES, 'venv', 'env', 'build', 'dist']);

export function isUnder(file: string, root: string): boolean {
  return root === '.' || file === root || file.startsWith(`${root}/`);
}

function isOutsideSkipped(entry: Dirent): boolean {
  return entry.name.startsWith(HIDDEN_PREFIX) || OUTSIDE_SKIPPED.has(entry.name);
}

function projectFiles(projectRoot: string): string[] {
  return projectFilesUnder(projectRoot, { skipDirectory: (_, entry) => isOutsideSkipped(entry) })
    .filter((file) => file.endsWith('.py'))
    .map((file) => relativePosix(projectRoot, file))
    .toSorted();
}

function dottedName(file: string): string {
  const parts = file.replace(/\.py$/u, '').split('/');
  return (parts.at(-1) === '__init__' ? parts.slice(0, -1) : parts).join('.');
}

export function listOtherModules(
  projectRoot: string,
  sourceRoots: readonly string[],
  production: readonly PythonModule[],
): OtherModule[] {
  const known = new Set(production.map(({ file }) => file));
  const isTest = testFileMatcher(projectRoot);
  const roots = existingSourceRoots(projectRoot, sourceRoots).filter((root) => root !== '.');
  return projectFiles(projectRoot)
    .filter((file) => !known.has(file))
    .map((file) => {
      const inside = roots.some((root) => isUnder(file, root));
      const kind = isTest(file) ? 'test' : 'other';
      return { file, module: dottedName(file), kind, inRoots: inside };
    })
    .filter(({ module }) => module !== '');
}
