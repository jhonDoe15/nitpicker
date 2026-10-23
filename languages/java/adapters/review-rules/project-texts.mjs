import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  blankComments,
  blankLiterals,
  pathInside,
  projectSourceFilesUnder,
} from './java-sources.mjs';

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
const COMMENT_STYLES = new Map([
  ['.xml', (text) => text.replaceAll(XML_COMMENT, ' ')],
  ['.gradle', blankComments],
  ['.kts', blankComments],
  ['.yml', (text) => text.replaceAll(HASH_COMMENT, '$1')],
  ['.yaml', (text) => text.replaceAll(HASH_COMMENT, '$1')],
  ['.toml', (text) => text.replaceAll(HASH_COMMENT, '$1')],
  ['.properties', (text) => text.replaceAll(LINE_HASH_COMMENT, '')],
]);
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const WEBAPP_ROOT = 'src/main/webapp';

function filesUnder(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function filesIn(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));
}

function isText(file) {
  const extension = path.extname(file).toLowerCase();
  return (
    !BINARY_EXTENSIONS.has(extension) &&
    !DOCUMENT_EXTENSIONS.has(extension) &&
    statSync(file).size <= MAX_TEXT_BYTES
  );
}

function entryFor(projectRoot, file) {
  const raw = readFileSync(file, 'utf8');
  const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
  if (CODE_EXTENSIONS.has(path.extname(file))) {
    return { file: relative, code: blankLiterals(raw), named: blankComments(raw) };
  }
  return raw.includes('\0') ? undefined : { file: relative, named: withoutComments(file, raw) };
}

function withoutComments(file, raw) {
  const isContainerFile = CONTAINER_FILES.some((name) => path.basename(file).endsWith(name));
  const strip = isContainerFile
    ? (text) => text.replaceAll(LINE_HASH_COMMENT, '')
    : COMMENT_STYLES.get(path.extname(file).toLowerCase());
  return strip === undefined ? raw : strip(raw);
}

function moduleDirectories(projects) {
  return [...new Set(['', ...projects.map((project) => project.qualifier)])];
}

export function readProjectTexts(projectRoot, projects) {
  function inProject(relative) {
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
    ...projectSourceFilesUnder(path.resolve(projectRoot), CONTAINER_FILES),
  ];
  return [...new Set(files)]
    .filter(isText)
    .map((file) => entryFor(projectRoot, file))
    .filter((entry) => entry !== undefined);
}

function escaped(text) {
  return text.replaceAll(/[$.]/gu, String.raw`\$&`);
}

export function isNamedElsewhere(texts, { file, className }) {
  const simpleName = className.split('.').at(-1);
  const packageName = className.split('.').slice(0, -1).join('.');
  const qualified = new RegExp(String.raw`(?<![\w$.])${escaped(className)}(?!\w)`, 'u');
  const simple = new RegExp(String.raw`(?<![\w$])${escaped(simpleName)}(?![\w$])`, 'u');
  const sees = new RegExp(
    String.raw`^\s*(?:package\s+${escaped(packageName)}\s*;?\s*$|import\s+${escaped(packageName)}\.\*)`,
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
