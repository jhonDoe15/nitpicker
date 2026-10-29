import { lineOfIndex, openingBracket } from '../text.mjs';

const KOTLIN_CAST = /\bas(?!\?)\s+([A-Za-z_][\w.]*(?:<[^>]*>)?\??)/gu;
const JAVA_CAST =
  /\(\s*((?:[a-z]\w*\.)*[A-Z]\w*(?:<[^()]*>)?(?:\s*\[\s*\])*)\s*\)\s*(?=[\w("'!~])/gu;
// A word before the `(` of a cast: these keywords can stand there, any other word makes it a call.
const BEFORE_CAST = new Set(['return', 'throw', 'case', 'else', 'yield', 'assert']);
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]+$/u;

const escaped = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
const baseOf = (type) =>
  type
    .replace(/[<[].*$/su, '')
    .replace(/\?$/u, '')
    .split('.')
    .at(-1);

/** The expression that ends at `end`: names, dots, calls and indexing, e.g. `rows.first(1)`. */
export function operandBefore(masked, end) {
  let index = end;
  while (index > 0) {
    const previous = masked[index - 1];
    if (')]}'.includes(previous)) {
      const open = openingBracket(masked, index - 1);
      if (open === -1) break;
      index = open;
      while (masked[index] === '{' && masked[index - 1] === ' ') index -= 1;
    } else if (/[\w.!]/u.test(previous)) index -= 1;
    else break;
  }
  return masked.slice(index, end).trim();
}

const endOfCode = (masked, index) => masked.slice(0, index).trimEnd().length;

// Whether `operand` was tested against `type` earlier in the file: `x is T` or `x instanceof T`.
function wasChecked({ masked, index, operand, type }) {
  if (operand === '') return false;
  const test = `(?:\\s+is\\s+|\\s+instanceof\\s+(?:final\\s+)?(?:[\\w.]*\\.)?)${escaped(baseOf(type))}\\b`;
  return new RegExp(`${escaped(operand)}${test}`, 'u').test(masked.slice(0, index));
}

const isImportLine = (masked, index) =>
  /^[ \t]*import\b/u.test(masked.slice(masked.lastIndexOf('\n', index) + 1, index));

function castOccurrence({ masked, match, operand, type, detail }) {
  if (wasChecked({ masked, index: match.index, operand, type })) return [];
  return [
    { kind: 'type-assertion', key: `as|${type}`, line: lineOfIndex(masked, match.index), detail },
  ];
}

/** Kotlin `x as T` (not the safe `as?`, not `import a.B as C`, not after an `is T` check). */
export function kotlinCasts(masked) {
  return [...masked.matchAll(KOTLIN_CAST)].flatMap((match) =>
    isImportLine(masked, match.index)
      ? []
      : castOccurrence({
          masked,
          match,
          operand: operandBefore(masked, endOfCode(masked, match.index)),
          type: match[1],
          detail: `unsafe cast: as ${match[1]}`,
        }),
  );
}

function isCastPosition(masked, index) {
  const before = masked.slice(0, index).trimEnd();
  const word = /(\w+)$/u.exec(before)?.[1];
  const type = /^\s*\(\s*([\w.]+)/u.exec(masked.slice(index))?.[1] ?? '';
  return (word === undefined || BEFORE_CAST.has(word)) && !CONSTANT_NAME.test(type);
}

/** Java `(T) x` (not a primitive conversion, not after an `instanceof T` check). */
export function javaCasts(masked) {
  return [...masked.matchAll(JAVA_CAST)].flatMap((match) =>
    isCastPosition(masked, match.index)
      ? castOccurrence({
          masked,
          match,
          operand: /^[\w.]*/u.exec(masked.slice(match.index + match[0].length))[0],
          type: match[1],
          detail: `unsafe cast: (${match[1]})`,
        })
      : [],
  );
}

/** Kotlin `x!!`, found wherever an expression ends: after a name, `)`, `]`, `}` or a literal. */
export function nonNullAssertions(masked) {
  const found = [];
  for (let index = masked.indexOf('!!'); index !== -1; index = masked.indexOf('!!', index + 1)) {
    const end = endOfCode(masked, index);
    if (end > 0 && /[\w)\]}"'`]/u.test(masked[end - 1])) {
      const operand = operandBefore(masked, end);
      found.push({
        kind: 'non-null-assertion',
        key: `!!|${operand}`,
        line: lineOfIndex(masked, index),
        detail: `non-null assertion: ${operand}!!`,
      });
    }
  }
  return found;
}
