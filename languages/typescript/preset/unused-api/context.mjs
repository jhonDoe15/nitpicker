import path from 'node:path';
import { storyGlobs } from '../eslint-config/scope-support.mjs';
import { codeExtensionNames, globToRegExp } from '../layout.mjs';

const TYPESCRIPT_EXTENSIONS = new Set(
  codeExtensionNames.filter((name) => name.includes('ts')).map((name) => `.${name}`),
);
const SUPPORT_DIRECTORY = /(?:^|\/)(?:\.storybook|test-support)\//u;
const STORY_FILE = storyGlobs.map((glob) => globToRegExp(glob));
const GENERATED_MARKER =
  /@generated|auto-?generated|generated (?:by|from|file)|do not (?:edit|modify)/iu;
const HEADER_LENGTH = 1000;

export function isTypeScriptFile(file) {
  return TYPESCRIPT_EXTENSIONS.has(path.extname(file));
}

function toPosix(file) {
  return file.replaceAll('\\', '/');
}

function isSupportPath(relative, layout) {
  return (
    layout.isTestFile(relative) ||
    layout.isTestFixture(`/${relative}`) ||
    SUPPORT_DIRECTORY.test(relative) ||
    STORY_FILE.some((matcher) => matcher.test(relative))
  );
}

function isGenerated(sourceFile) {
  return GENERATED_MARKER.test(sourceFile.text.slice(0, HEADER_LENGTH));
}

function fileEntry({ sourceFile, projectRoot, packagesInfo, layout }) {
  const owner = packagesInfo.packageOf(sourceFile.fileName);
  const relative = toPosix(path.relative(owner?.dir ?? projectRoot, sourceFile.fileName));
  const projectRelative = toPosix(path.relative(projectRoot, sourceFile.fileName));
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

function isOwnable(entry, sourceFile, layout) {
  return (
    entry.insideProject &&
    entry.role === 'production' &&
    isTypeScriptFile(entry.path) &&
    layout.isSourceFile(entry.path) &&
    !isGenerated(sourceFile)
  );
}

/** The analyzed files, with their role (production or support code), package and ownership. */
export function createContext({ program, projectRoot, layout, packagesInfo }) {
  const roots = new Set(program.getRootFileNames());
  const files = program
    .getSourceFiles()
    .filter((sourceFile) => roots.has(sourceFile.fileName) && !sourceFile.isDeclarationFile);
  const fileInfo = new Map(
    files.map((sourceFile) => [
      sourceFile.fileName,
      fileEntry({ sourceFile, projectRoot, packagesInfo, layout }),
    ]),
  );
  const owned = new Map(
    files
      .filter((sourceFile) => isOwnable(fileInfo.get(sourceFile.fileName), sourceFile, layout))
      .map((sourceFile) => [sourceFile.fileName, fileInfo.get(sourceFile.fileName)]),
  );
  return { program, checker: program.getTypeChecker(), files, fileInfo, owned };
}
