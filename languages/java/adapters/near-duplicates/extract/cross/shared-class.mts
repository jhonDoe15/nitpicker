import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ClassBodyRequest, ClassTextRequest, Scan, ScanEntry } from '../../extract-types.mts';
import { escapeRegExp, isRealPathInside, readRealInside, resolveInside } from '../../jvm-views.mts';
import { pairOf, present } from '../syntax.mts';
import { isJdkType } from './names/jdk-types.mts';

const WORDS = /[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/gu;

function wordsOf(name: string): string[] {
  return name.match(WORDS) ?? [];
}

function commonPrefix(left: readonly string[], right: readonly string[]): string[] {
  const index = left.findIndex((word, at) => right[at]?.toLowerCase() !== word.toLowerCase());
  return left.slice(0, index === -1 ? left.length : index);
}

export function classNameFor([first, second]: readonly [string, string]): string | undefined {
  const [left, right] = pairOf([first, second].map(wordsOf));
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

function sourceRootOf(folder: string, tail: string): string {
  if (folder === '') {
    return '';
  }
  if (tail === '') {
    return `${folder}/`;
  }
  return folder.endsWith(tail) ? folder.slice(0, -tail.length) : '';
}

export function packageFolders(folder: string, packageLine: string): string[] {
  const tail = (PACKAGE.exec(packageLine)?.[1] ?? '').replaceAll('.', '/');
  const set = SOURCE_SET.exec(sourceRootOf(folder, tail));
  return set === null
    ? [folder]
    : ['java', 'kotlin', 'groovy'].map((lang) => `${present(set[1])}${lang}/${tail}`);
}

function everyFolder(root: string, folder: string, packageLine: string): string[] {
  const tail = (PACKAGE.exec(packageLine)?.[1] ?? '').replaceAll('.', '/');
  const set = ANY_SET.exec(sourceRootOf(folder, tail));
  if (set === null) {
    return [folder];
  }
  const sets = listing(root, present(set[1]).slice(0, -1));
  const folders = sets.flatMap((name) =>
    ['java', 'kotlin', 'groovy'].map((lang) => `${present(set[1])}${name}/${lang}/${tail}`),
  );
  return [...new Set([...packageFolders(folder, packageLine), ...folders])];
}

function listing(root: string, folder: string): string[] {
  const directory = folder === '' ? path.resolve(root) : resolveInside(root, folder);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return folder === '' || isRealPathInside(root, directory) ? readdirSync(directory) : [];
}

function scanFolders(root: string, folders: readonly string[]): ScanEntry[] {
  return folders.flatMap((folder) =>
    listing(root, folder)
      .filter((file) => SOURCE_FILE.test(file))
      .map((file) => ({
        name: file.replace(SOURCE_FILE, ''),
        text: readRealInside(root, path.posix.join(folder, file), 'utf8') ?? '',
      })),
  );
}

export function packageScanner(root: string): Scan {
  const scans = new Map<string, ScanEntry[]>();
  function scan(folders: readonly string[]): ScanEntry[] {
    const key = folders.join('\u0000');
    if (!scans.has(key)) {
      scans.set(key, scanFolders(root, folders));
    }
    return present(scans.get(key));
  }
  scan.everySet = (folder: string, packageLine: string) => everyFolder(root, folder, packageLine);
  return scan;
}

export function folderTypes(scan: Scan, folders: readonly string[]): Set<string> {
  return new Set(scan(folders).map(({ name }) => name));
}

export function diskProblem({
  scan,
  folders,
  name,
}: {
  scan: Scan;
  folders: readonly string[];
  name: string;
}): string | undefined {
  if (isJdkType(name)) {
    return `the name ${name} is the name of a class of the JDK`;
  }
  const files = scan(folders);
  if (files.some((entry) => entry.name === name)) {
    return `a file named ${name} already exists in the package`;
  }
  const word = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'u');
  return files.some(({ text }) => word.test(text))
    ? `the name ${name} is used in the package`
    : undefined;
}

function classBody({ name, members, unit, annotations }: ClassBodyRequest): string {
  const marks = annotations.map((annotation) => `${annotation}\n`).join('');
  const body = members.map((member) => `${unit}${member}`).join('\n\n');
  return `${marks}final class ${name} {\n${unit}private ${name}() {}\n\n${body}\n}`;
}

export function classText({ header, packageLine, imports, ...rest }: ClassTextRequest): string {
  const sections = [header, packageLine, imports.join('\n'), classBody(rest)];
  return `${sections.filter((section) => section !== '').join('\n\n')}\n`;
}
