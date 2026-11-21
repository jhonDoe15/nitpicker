import path from 'node:path';
import type TypeScript from 'typescript';
import { storyGlobs as untypedStoryGlobs } from '../eslint-config/scope-support.mts';
import {
  codeExtensionNames,
  globMatcher as untypedGlobMatcher,
  toPosix as untypedToPosix,
} from '../layout.mts';
import type { Context, ContextLayout, ContextOptions, FileInfo } from './typed/context-types.mts';

const storyGlobs: readonly string[] = untypedStoryGlobs;
const globMatcher: (glob: string) => { test(value: string): boolean } = untypedGlobMatcher;
const toPosix: (file: string) => string = untypedToPosix;

const TYPESCRIPT_EXTENSIONS = new Set(
  codeExtensionNames.filter((name) => name.includes('ts')).map((name) => `.${name}`),
);
const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx']);
const SUPPORT_DIRECTORY = /(?:^|\/)(?:\.storybook|test-support)\//u;
const STORY_FILE = storyGlobs.map((glob) => globMatcher(glob));
const GENERATED_MARKER =
  /@generated|auto-?generated|generated (?:by|from|file)|do not (?:edit|modify)/iu;
const HEADER_LENGTH = 1000;

function isTypeScriptFile(file: string): boolean {
  return TYPESCRIPT_EXTENSIONS.has(path.extname(file));
}

export function isJavascriptFile(file: string): boolean {
  return JAVASCRIPT_EXTENSIONS.has(path.extname(file));
}

export function isAnalyzedFile(file: string, layout: ContextLayout): boolean {
  return isTypeScriptFile(file) || (layout.javascript && isJavascriptFile(file));
}

function isSupportPath(relative: string, layout: ContextLayout): boolean {
  return (
    layout.isTestFile(relative) ||
    layout.isTestFixture(`/${relative}`) ||
    SUPPORT_DIRECTORY.test(relative) ||
    STORY_FILE.some((matcher) => matcher.test(relative))
  );
}

export function isGenerated(sourceFile: TypeScript.SourceFile): boolean {
  return GENERATED_MARKER.test(sourceFile.text.slice(0, HEADER_LENGTH));
}

export function fileEntry({
  fileName,
  projectRoot,
  packagesInfo,
  layout,
}: Omit<ContextOptions, 'program'> & { readonly fileName: string }): FileInfo {
  const owner = packagesInfo.packageOf(fileName);
  const relative = toPosix(path.relative(owner?.dir ?? projectRoot, fileName));
  const projectRelative = toPosix(path.relative(projectRoot, fileName));
  const insideProject = !projectRelative.startsWith('..') && !path.isAbsolute(projectRelative);
  const isSupport =
    isSupportPath(relative, layout) || (insideProject && isSupportPath(projectRelative, layout));
  return {
    path: projectRelative,
    package: owner,
    packageDir: owner?.dir,
    role: isSupport ? 'support' : 'production',
    insideProject,
  };
}

export function isOwnablePath(
  entry: FileInfo | undefined,
  layout: ContextLayout,
): entry is FileInfo {
  return (
    entry !== undefined &&
    entry.insideProject &&
    entry.role === 'production' &&
    isAnalyzedFile(entry.path, layout) &&
    layout.isSourceFile(entry.path)
  );
}

function isOwnable(
  entry: FileInfo | undefined,
  sourceFile: TypeScript.SourceFile,
  layout: ContextLayout,
): entry is FileInfo {
  return isOwnablePath(entry, layout) && !isGenerated(sourceFile);
}

export function createContext({
  program,
  projectRoot,
  layout,
  packagesInfo,
}: ContextOptions): Context {
  const roots = new Set(program.getRootFileNames());
  const files = program
    .getSourceFiles()
    .filter((sourceFile) => roots.has(sourceFile.fileName) && !sourceFile.isDeclarationFile);
  const fileInfo = new Map(
    files.map((sourceFile): [string, FileInfo] => [
      sourceFile.fileName,
      fileEntry({ fileName: sourceFile.fileName, projectRoot, packagesInfo, layout }),
    ]),
  );
  const owned = new Map(
    files.flatMap((sourceFile): [string, FileInfo][] => {
      const entry = fileInfo.get(sourceFile.fileName);
      return isOwnable(entry, sourceFile, layout) ? [[sourceFile.fileName, entry]] : [];
    }),
  );
  return { program, checker: program.getTypeChecker(), files, fileInfo, owned };
}
