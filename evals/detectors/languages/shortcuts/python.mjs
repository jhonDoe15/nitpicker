import { closingBracket, lineOfIndex } from '../text.mjs';
import { handlerFinding, statementsOf } from './handlers.mjs';

const BROAD_EXCEPTIONS = new Set(['Exception', 'BaseException', 'builtins.Exception']);
const EXCEPT_CLAUSE = /^[ \t]*except\*?[ \t]*([^:\n]*?)[ \t]*:[ \t]*(.*)$/u;
const TYPING_IMPORT =
  /^[ \t]*from[ \t]+typing(?:_extensions)?[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gmu;
const TYPING_CAST = /\b(?:typing|typing_extensions|t)\s*\.\s*cast\s*\(/gu;
const SUPPRESS_ALL = /\bsuppress\s*\(\s*(?:builtins\.)?(?:Base)?Exception\s*\)/gu;

const indentOf = (line) => /^[ \t]*/u.exec(line)[0].length;

// The first argument of the call whose `(` is at `open`, up to the first comma outside brackets.
function firstArgument({ masked, text, open }) {
  const close = closingBracket(masked, open);
  const end = close === -1 ? masked.length : close;
  let depth = 0;
  for (let index = open + 1; index < end; index += 1) {
    depth += Number('([{'.includes(masked[index])) - Number(')]}'.includes(masked[index]));
    if (depth === 0 && masked[index] === ',') return text.slice(open + 1, index).trim();
  }
  return text.slice(open + 1, end).trim();
}

// The local names a `from typing import ...` brings `name` in as (`Any as A` gives `A`).
function localNames(masked, name) {
  const pattern = new RegExp(String.raw`\b${name}\b(?:\s+as\s+(\w+))?`, 'u');
  return [...masked.matchAll(TYPING_IMPORT)].flatMap((match) => {
    const found = pattern.exec(match[1].replaceAll(/[()]/gu, ' '));
    return found === null ? [] : [found[1] ?? name];
  });
}

function castOccurrences({ masked, text }) {
  const bare = localNames(masked, 'cast').map(
    (name) => new RegExp(String.raw`(?<![\w.])${name}\s*\(`, 'gu'),
  );
  return [TYPING_CAST, ...bare].flatMap((pattern) =>
    [...masked.matchAll(pattern)].map((match) => {
      const open = match.index + match[0].length - 1;
      const type = firstArgument({ masked, text, open }).replaceAll(/\s+/gu, ' ');
      return {
        kind: 'type-assertion',
        key: `cast|${type}`,
        line: lineOfIndex(masked, match.index),
        detail: `type assertion: cast(${type}, ...)`,
      };
    }),
  );
}

const countOf = (line, character) => line.split(character).length - 1;

// Whether each line is an import or inside a parenthesised `from x import (...)` list.
function importLines(lines) {
  let depth = 0;
  return lines.map((line) => {
    const inside = depth > 0 || /^[ \t]*(?:from[ \t]+\S+[ \t]+)?import\b/u.test(line);
    if (inside) depth = Math.max(0, depth + countOf(line, '(') - countOf(line, ')'));
    return inside;
  });
}

function anyOccurrences({ masked }) {
  const names = ['Any', ...localNames(masked, 'Any').filter((name) => name !== 'Any')];
  const pattern = new RegExp(String.raw`(?<![\w])(?:${names.join('|')})\b`, 'gu');
  const lines = masked.split('\n');
  const imports = importLines(lines);
  return lines.flatMap((line, index) =>
    imports[index]
      ? []
      : [...line.matchAll(pattern)].map(() => ({
          kind: 'any',
          key: 'any',
          line: index + 1,
          detail: 'Any type',
        })),
  );
}

// The statements of the body of the `except` clause on lines[at]; `inline` is what follows the colon.
function exceptBody({ lines, at, inline }) {
  if (inline !== '') return inline;
  const indent = indentOf(lines[at]);
  const end = lines.findIndex(
    (line, index) => index > at && line.trim() !== '' && indentOf(line) <= indent,
  );
  return lines.slice(at + 1, end === -1 ? undefined : end).join('\n');
}

function broadTypes(clause) {
  const types = clause
    .replace(/\s+as\s+\w+$/u, '')
    .replaceAll(/[()\s]/gu, '')
    .split(',');
  return clause === '' ? ['bare'] : types.filter((type) => BROAD_EXCEPTIONS.has(type));
}

function exceptOccurrences({ masked }) {
  const lines = masked.split('\n');
  return lines.flatMap((line, at) => {
    const match = EXCEPT_CLAUSE.exec(line);
    if (match === null) return [];
    const body = exceptBody({ lines, at, inline: match[2].trim() });
    const found = handlerFinding({
      language: 'python',
      body,
      statements: statementsOf(body),
      broadTypes: broadTypes(match[1]),
      shown: match[1] === '' ? 'except:' : `except ${match[1]}:`,
    });
    return found === undefined ? [] : [{ ...found, line: at + 1 }];
  });
}

const suppressOccurrences = ({ masked }) =>
  [...masked.matchAll(SUPPRESS_ALL)].map((match) => ({
    kind: 'ignored-error',
    key: 'suppress',
    line: lineOfIndex(masked, match.index),
    detail: 'suppress(Exception) swallows every error',
  }));

/**
 * The type escapes and swallowed errors in a Python file, as `{ kind, key, line, detail }`, found
 * in code with comments and string contents blanked out. `any`: a use of `Any`, under its alias
 * too (importing it is not). `type-assertion`: `typing.cast(T, x)`, or `cast(T, x)` (also under an
 * alias) in a file that imports it from `typing`. `ignored-error` and `broad-catch`: the `except`
 * clauses `handlerFinding` judges, and `contextlib.suppress(Exception)`.
 */
export function pythonShortcuts({ masked, text }) {
  return [
    ...anyOccurrences({ masked }),
    ...castOccurrences({ masked, text }),
    ...exceptOccurrences({ masked }),
    ...suppressOccurrences({ masked }),
  ];
}
