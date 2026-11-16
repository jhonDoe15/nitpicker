import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import {
  blankComments as untypedBlankComments,
  blankLiterals as untypedBlankLiterals,
  pathInside as untypedPathInside,
  sourceFilesUnder as untypedSourceFilesUnder,
} from './java-sources.mjs';

export type TextProject = {
  readonly qualifier: string;
  readonly sourceRoots: readonly string[];
  readonly kotlinSourceRoots: readonly string[];
  readonly resourceRoots: readonly string[];
};

export type ProjectText = {
  readonly file: string;
  readonly code?: string;
  readonly named: string;
};

const projectFilesUnder: (
  root: string,
  options: {
    readonly includeIgnored: boolean;
    readonly skipDirectory: (directory: unknown, entry: { readonly name: string }) => boolean;
  },
) => string[] = untypedProjectFilesUnder;
const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
const blankComments: (text: string) => string = untypedBlankComments;
const blankLiterals: (text: string) => string = untypedBlankLiterals;
const pathInside: (base: string, relative: string) => string = untypedPathInside;
const sourceFilesUnder: (root: string, extensions: readonly string[]) => string[] =
  untypedSourceFilesUnder;

const CODE_EXTENSIONS = new Set(['.java', '.kt']);
const BINARY_EXTENSIONS = new Set([
  '.class',
  '.jar',
  '.war',
  '.zip',
  '.gz',
  '.tgz',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.pdf',
  '.so',
  '.dll',
  '.exe',
  '.bin',
]);
const DOCUMENT_EXTENSIONS = new Set(['.md', '.markdown', '.adoc', '.rst', '.txt']);
const CONTAINER_FILES = ['Dockerfile', 'Containerfile', '.dockerfile', '.containerfile'];
const XML_COMMENT = /<!--[\s\S]*?-->/gu;
const HASH_COMMENT = /(^|\s)#.*$/gmu;
const LINE_HASH_COMMENT = /^\s*[#!].*$/gmu;
const COMMENT_STYLES = new Map<string, (text: string) => string>([
  ['.xml', (text: string) => text.replaceAll(XML_COMMENT, ' ')],
  ['.gradle', blankComments],
  ['.kts', blankComments],
  ['.yml', (text: string) => text.replaceAll(HASH_COMMENT, '$1')],
  ['.yaml', (text: string) => text.replaceAll(HASH_COMMENT, '$1')],
  ['.toml', (text: string) => text.replaceAll(HASH_COMMENT, '$1')],
  ['.properties', (text: string) => text.replaceAll(LINE_HASH_COMMENT, '')],
]);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const WEBAPP_ROOT = 'src/main/webapp';
const DEPENDENCY_DIRECTORY = 'node_modules';

function filesUnder(directory: string): string[] {
  return projectFilesUnder(directory, {
    includeIgnored: true,
    skipDirectory: (_, entry) => entry.name === DEPENDENCY_DIRECTORY,
  });
}

function filesIn(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));
}

function isText(file: string): boolean {
  const extension = path.extname(file).toLowerCase();
  return (
    !BINARY_EXTENSIONS.has(extension) &&
    !DOCUMENT_EXTENSIONS.has(extension) &&
    statSync(file).size <= MAX_TEXT_BYTES
  );
}

function entryFor(projectRoot: string, file: string): ProjectText | undefined {
  const raw = readFileSync(file, 'utf8');
  const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
  if (CODE_EXTENSIONS.has(path.extname(file))) {
    return { file: relative, code: blankLiterals(raw), named: blankComments(raw) };
  }
  return raw.includes('\0') ? undefined : { file: relative, named: withoutComments(file, raw) };
}

function withoutComments(file: string, raw: string): string {
  const isContainerFile = CONTAINER_FILES.some((name) => path.basename(file).endsWith(name));
  const strip = isContainerFile
    ? (text: string) => text.replaceAll(LINE_HASH_COMMENT, '')
    : COMMENT_STYLES.get(path.extname(file).toLowerCase());
  return strip === undefined ? raw : strip(raw);
}

function moduleDirectories(projects: readonly TextProject[]): string[] {
  return [...new Set(['', ...projects.map((project) => project.qualifier)])];
}

export function readProjectTexts(
  projectRoot: string,
  projects: readonly TextProject[],
): ProjectText[] {
  function inProject(relative: string): string {
    return pathInside(projectRoot, relative);
  }
  const sourceRoots = projects.flatMap((project) => [
    ...project.sourceRoots,
    ...project.kotlinSourceRoots,
  ]);
  const resourceRoots = projects.flatMap((project) => project.resourceRoots);
  const directories = moduleDirectories(projects);
  const files = [
    ...[...sourceRoots, ...resourceRoots].flatMap((root) => filesUnder(inProject(root))),
    ...directories.flatMap((directory) => filesUnder(inProject(path.join(directory, WEBAPP_ROOT)))),
    ...directories.flatMap((directory) => filesIn(inProject(directory || '.'))),
    ...sourceFilesUnder(path.resolve(projectRoot), CONTAINER_FILES),
  ];
  return [...new Set(files)]
    .filter(isText)
    .map((file) => entryFor(projectRoot, file))
    .filter((entry) => entry !== undefined);
}

export function isNamedElsewhere(
  texts: readonly ProjectText[],
  { file, className }: { readonly file: string; readonly className: string },
): boolean {
  const simpleName = className.split('.').at(-1) ?? '';
  const packageName = className.split('.').slice(0, -1).join('.');
  const qualified = new RegExp(String.raw`(?<![\w$.])${escapeRegExp(className)}(?!\w)`, 'u');
  const simple = new RegExp(String.raw`(?<![\w$])${escapeRegExp(simpleName)}(?![\w$])`, 'u');
  const sees = new RegExp(
    String.raw`^\s*(?:package\s+${escapeRegExp(packageName)}\s*;?\s*$|import\s+${escapeRegExp(packageName)}\.\*)`,
    'mu',
  );
  return texts.some(
    (entry) =>
      entry.file !== file &&
      (qualified.test(entry.named) ||
        (entry.code !== undefined &&
          path.basename(entry.file).split('.')[0] !== simpleName &&
          simple.test(entry.code) &&
          sees.test(entry.code))),
  );
}
