import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readInside, resolveInside } from '../../../../../../shared/conventions/read-inside.mjs';

const WORDS = /[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/gu;

function wordsOf(name) {
  return name.match(WORDS) ?? [];
}

function commonPrefix(left, right) {
  const index = left.findIndex((word, at) => right[at]?.toLowerCase() !== word.toLowerCase());
  return left.slice(0, index === -1 ? left.length : index);
}

export function classNameFor([first, second]) {
  const [left, right] = [first, second].map(wordsOf);
  const prefix = commonPrefix(left, right);
  const suffix = commonPrefix(left.toReversed(), right.toReversed()).toReversed();
  const room = Math.min(left.length, right.length) - prefix.length;
  const tail = room <= 0 ? [] : suffix.slice(Math.max(0, suffix.length - room));
  const base = [...prefix, ...tail].join('');
  if (base === '') {
    return undefined;
  }
  return tail.length > 0 && !base.endsWith('s') ? `${base}s` : `${base}Support`;
}

const SOURCE_FILE = /\.(?:java|kt|groovy)$/u;
const SOURCE_SET = /^((?:.*\/)?src\/(?:main|test)\/)(?:java|kotlin|groovy)\/$/u;
const PACKAGE = /^\s*package\s+([\w.]+)\s*;/mu;

function sourceRootOf(folder, tail) {
  if (folder === '') {
    return '';
  }
  if (tail === '') {
    return `${folder}/`;
  }
  return folder.endsWith(tail) ? folder.slice(0, -tail.length) : '';
}

export function packageFolders(folder, packageLine) {
  const tail = (PACKAGE.exec(packageLine)?.[1] ?? '').replaceAll('.', '/');
  const set = SOURCE_SET.exec(sourceRootOf(folder, tail));
  return set === null
    ? [folder]
    : ['java', 'kotlin', 'groovy'].map((lang) => `${set[1]}${lang}/${tail}`);
}

function directoryOf(root, folder) {
  const directory = folder === '' ? path.resolve(root) : resolveInside(root, folder);
  return directory !== undefined && existsSync(directory) ? directory : undefined;
}

function packageFiles(root, folders) {
  return folders.flatMap((folder) => {
    const directory = directoryOf(root, folder);
    return directory === undefined
      ? []
      : readdirSync(directory)
          .filter((name) => SOURCE_FILE.test(name))
          .map((name) => ({ name: name.replace(SOURCE_FILE, ''), directory, file: name }));
  });
}

export function folderTypes(root, folders) {
  return new Set(packageFiles(root, folders).map(({ name }) => name));
}

export function diskProblem({ root, folders, name }) {
  const files = packageFiles(root, folders);
  if (files.some((entry) => entry.name === name)) {
    return `a file named ${name} already exists in the package`;
  }
  const word = new RegExp(`\\b${name}\\b`, 'u');
  const used = files.some(({ directory, file }) =>
    word.test(readInside(directory, file, 'utf8') ?? ''),
  );
  return used ? `the name ${name} is used in the package` : undefined;
}

export function classText({ header, packageLine, imports, name, members, unit, annotations }) {
  const sections = [
    header,
    packageLine,
    imports.join('\n'),
    `${annotations.map((annotation) => `${annotation}\n`).join('')}final class ${name} {\n${unit}private ${name}() {}\n\n${members
      .map((member) => `${unit}${member}`)
      .join('\n\n')}\n}`,
  ];
  return `${sections.filter((section) => section !== '').join('\n\n')}\n`;
}
