import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isJdkType } from './names/jdk-types.mjs';
import {
  isRealPathInside,
  readRealInside,
  resolveInside,
} from '../../../../../../shared/conventions/read-inside.mjs';

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
const ANY_SET = /^((?:.*\/)?src\/)[^/]+\/(?:java|kotlin|groovy)\/$/u;
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

function everyFolder(root, folder, packageLine) {
  const tail = (PACKAGE.exec(packageLine)?.[1] ?? '').replaceAll('.', '/');
  const set = ANY_SET.exec(sourceRootOf(folder, tail));
  if (set === null) {
    return [folder];
  }
  const sets = listing(root, set[1].slice(0, -1));
  const folders = sets.flatMap((name) =>
    ['java', 'kotlin', 'groovy'].map((lang) => `${set[1]}${name}/${lang}/${tail}`),
  );
  return [...new Set([...packageFolders(folder, packageLine), ...folders])];
}

function listing(root, folder) {
  const directory = folder === '' ? path.resolve(root) : resolveInside(root, folder);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return folder === '' || isRealPathInside(root, directory) ? readdirSync(directory) : [];
}

function scanFolders(root, folders) {
  return folders.flatMap((folder) =>
    listing(root, folder)
      .filter((file) => SOURCE_FILE.test(file))
      .map((file) => ({
        name: file.replace(SOURCE_FILE, ''),
        text: readRealInside(root, path.posix.join(folder, file), 'utf8') ?? '',
      })),
  );
}

export function packageScanner(root) {
  const scans = new Map();
  function scan(folders) {
    const key = folders.join('\u0000');
    if (!scans.has(key)) {
      scans.set(key, scanFolders(root, folders));
    }
    return scans.get(key);
  }
  scan.everySet = (folder, packageLine) => everyFolder(root, folder, packageLine);
  return scan;
}

export function folderTypes(scan, folders) {
  return new Set(scan(folders).map(({ name }) => name));
}

export function diskProblem({ scan, folders, name }) {
  if (isJdkType(name)) {
    return `the name ${name} is the name of a class of the JDK`;
  }
  const files = scan(folders);
  if (files.some((entry) => entry.name === name)) {
    return `a file named ${name} already exists in the package`;
  }
  const word = new RegExp(`\\b${name}\\b`, 'u');
  return files.some(({ text }) => word.test(text))
    ? `the name ${name} is used in the package`
    : undefined;
}

function classBody({ name, members, unit, annotations }) {
  const marks = annotations.map((annotation) => `${annotation}\n`).join('');
  const body = members.map((member) => `${unit}${member}`).join('\n\n');
  return `${marks}final class ${name} {\n${unit}private ${name}() {}\n\n${body}\n}`;
}

export function classText({ header, packageLine, imports, ...rest }) {
  const sections = [header, packageLine, imports.join('\n'), classBody(rest)];
  return `${sections.filter((section) => section !== '').join('\n\n')}\n`;
}
