import { existsSync } from 'node:fs';
import path from 'node:path';
import { groupKind, namesOf } from './dependency-names.mjs';
import { parseIni, readText } from './dependency-text.mjs';

const PAIRS = { '[': ']', '{': '}', '(': ')' };
const CLOSERS = Object.values(PAIRS);
const STRING = /(["'])((?:(?!\1).)+)\1/gu;
const EXTRA = /(["'])([^"']+)\1\s*:\s*(?=\[)/gu;

function linesOf(text) {
  return (text ?? '').split('\n');
}

export function setupCfgGroups(projectRoot) {
  const file = path.join(projectRoot, 'setup.cfg');
  if (!existsSync(file)) {
    return [];
  }
  const sections = parseIni(readText(file));
  const options = sections.get('options') ?? new Map();
  const extras = sections.get('options.extras_require') ?? new Map();
  return [
    { kind: 'runtime', names: namesOf(linesOf(options.get('install_requires'))) },
    { kind: 'development', names: namesOf(linesOf(options.get('tests_require'))) },
    ...[...extras].map(([group, text]) => ({
      kind: groupKind(group),
      names: namesOf(linesOf(text)),
    })),
  ];
}

function quoteAfter(quote, character) {
  if (quote !== undefined) {
    return character === quote ? undefined : quote;
  }
  return character === '"' || character === "'" ? character : undefined;
}

function structuralCharacters(text, start) {
  const marks = [];
  let quote;
  for (const [offset, character] of [...text.slice(start)].entries()) {
    const quoted = quote !== undefined;
    quote = quoteAfter(quote, character);
    if (!quoted && quote === undefined) {
      marks.push([start + offset, character]);
    }
  }
  return marks;
}

function closing(text, start) {
  let depth = 0;
  for (const [index, character] of structuralCharacters(text, start)) {
    depth += character in PAIRS ? 1 : 0;
    depth -= CLOSERS.includes(character) ? 1 : 0;
    if (depth === 0) {
      return index;
    }
  }
  return -1;
}

function literalAfter(source, key) {
  const match = new RegExp(`\\b${key}\\s*=\\s*[\\[{(]`, 'u').exec(source);
  if (match === null) {
    return undefined;
  }
  const start = match.index + match[0].length - 1;
  const end = closing(source, start);
  return end === -1 ? undefined : source.slice(start, end + 1);
}

function stringsOf(literal) {
  return [...literal.matchAll(STRING)].map((match) => match[2]);
}

function extrasOf(literal) {
  return [...literal.matchAll(EXTRA)].map((match) => {
    const start = match.index + match[0].length;
    const end = closing(literal, start);
    return { kind: groupKind(match[2]), names: namesOf(stringsOf(literal.slice(start, end + 1))) };
  });
}

function listGroup(source, key, kind) {
  const literal = literalAfter(source, key);
  return { kind, names: literal === undefined ? [] : namesOf(stringsOf(literal)) };
}

function withoutComment(line) {
  let quote;
  for (const [index, character] of [...line].entries()) {
    if (quote !== undefined) {
      quote = character === quote ? undefined : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '#') {
      return line.slice(0, index);
    }
  }
  return line;
}

export function setupPyGroups(projectRoot) {
  const file = path.join(projectRoot, 'setup.py');
  if (!existsSync(file)) {
    return [];
  }
  const source = readText(file).split(/\r?\n/u).map(withoutComment).join('\n');
  const extras = literalAfter(source, 'extras_require');
  return [
    listGroup(source, 'install_requires', 'runtime'),
    listGroup(source, 'tests_require', 'development'),
    ...(extras === undefined ? [] : extrasOf(extras)),
  ];
}
