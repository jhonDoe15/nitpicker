import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';

const SKIPPED_DIRECTORIES = new Set(['.git', '.gradle', 'build', 'node_modules', 'out', 'target']);
const LITERALS = new RegExp(
  [
    String.raw`"""[\s\S]*?"""`,
    String.raw`\/\/[^\n]*`,
    String.raw`\/\*[\s\S]*?\*\/`,
    String.raw`"(?:\\.|[^"\\\n])*"`,
    String.raw`'(?:\\.|[^'\\\n])*'`,
  ].join('|'),
  'gu',
);
const PACKAGE = /^\s*package\s+([\w.]+)\s*(?:;|$)/mu;
const IMPORT = /^\s*import\s+([\w.]+)\s*;/gmu;
const STATIC_IMPORT = /^\s*import\s+static\s+([\w.]+?)(\.\*)?\s*;/gmu;
const DEPTH_CHANGE = { '(': 1, '[': 1, ')': -1, ']': -1 };
const EXPRESSION_END = ';,?:{}';

function blank(literal) {
  return literal.replaceAll(/[^\n]/gu, ' ');
}

export function blankLiterals(text) {
  return text.replaceAll(LITERALS, blank);
}

export function blankComments(text) {
  return text.replaceAll(LITERALS, (literal) =>
    literal.startsWith('//') || literal.startsWith('/*') ? blank(literal) : literal,
  );
}

export function pathInside(base, relative) {
  const root = path.resolve(base);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`${relative} is outside ${base}`);
  }
  return full;
}

export function sourceFilesUnder(root, extensions, options = {}) {
  const { skipped = SKIPPED_DIRECTORIES, ...listing } = options;
  return projectFilesUnder(root, {
    ...listing,
    skipDirectory: (_, entry) => skipped.has(entry.name),
  })
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .sort();
}

export function javaFilesUnder(root) {
  return sourceFilesUnder(root, ['.java'], { includeIgnored: true });
}

export function readJavaSource(file) {
  return existsSync(file) ? blankLiterals(readFileSync(file, 'utf8')) : undefined;
}

export function packageOf(text) {
  return PACKAGE.exec(text)?.[1] ?? '';
}

export function importsOf(text) {
  return [...text.matchAll(IMPORT)].map((match) => match[1]);
}

export function staticImportsOf(text) {
  return [...text.matchAll(STATIC_IMPORT)].map((match) =>
    match[2] === undefined
      ? { owner: match[1].split('.').slice(0, -1).join('.'), name: match[1].split('.').at(-1) }
      : { owner: match[1], name: '*' },
  );
}

export function offsetOf(text, { line, column = 1 }) {
  const lines = text.split('\n');
  const before = lines.slice(0, line - 1).reduce((sum, current) => sum + current.length + 1, 0);
  return before + column - 1;
}

export function expressionAt(text, start) {
  let depth = 0;
  let end = start;
  for (const character of text.slice(start)) {
    depth += DEPTH_CHANGE[character] ?? 0;
    if (depth < 0 || (depth === 0 && EXPRESSION_END.includes(character))) {
      return text.slice(start, end);
    }
    end += character.length;
  }
  return text.slice(start);
}
