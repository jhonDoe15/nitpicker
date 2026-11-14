import { existsSync, readdirSync } from 'node:fs';
import { readInside, resolveInside } from '../../../../../../shared/conventions/read-inside.mjs';

const WORDS = /[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/gu;
const JAVA_FILE = /\.java$/u;

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

function folderTexts(root, folder) {
  const directory = resolveInside(root, folder);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((name) => JAVA_FILE.test(name))
    .flatMap((name) => readInside(directory, name, 'utf8') ?? []);
}

export function diskProblem({ root, folder, name }) {
  const file = resolveInside(root, `${folder}/${name}.java`);
  if (file === undefined || existsSync(file)) {
    return `${folder === '' ? '' : `${folder}/`}${name}.java already exists`;
  }
  const word = new RegExp(`\\b${name}\\b`, 'u');
  return folderTexts(root, folder).some((text) => word.test(text))
    ? `the name ${name} is used in the package`
    : undefined;
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
