import { capture } from '../../common/matches.mts';
import type { Occurrence } from '../../common/types.mts';
import { lineOfIndex, openingBracket } from '../text.mts';

const KOTLIN_CAST = /\bas(?!\?)\s+([A-Za-z_][\w.]*(?:<[^>]*>)?\??)/gu;
const JAVA_CAST =
  /\(\s*((?:[a-z]\w*\.)*[A-Z]\w*(?:<[^()]*>)?(?:\s*\[\s*\])*)\s*\)\s*(?=[\w("'!~])/gu;
const BEFORE_CAST = new Set(['return', 'throw', 'case', 'else', 'yield', 'assert']);
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]+$/u;

function escaped(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function baseOf(type: string): string {
  return (
    type
      .replace(/[<[].*$/su, '')
      .replace(/\?$/u, '')
      .split('.')
      .at(-1) ?? ''
  );
}

export function operandBefore(masked: string, end: number): string {
  let index = end;
  while (index > 0) {
    const previous = masked.charAt(index - 1);
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

function endOfCode(masked: string, index: number): number {
  return masked.slice(0, index).trimEnd().length;
}

function wasChecked({
  masked,
  index,
  operand,
  type,
}: {
  masked: string;
  index: number;
  operand: string;
  type: string;
}): boolean {
  if (operand === '') return false;
  const test = `(?:\\s+is\\s+|\\s+instanceof\\s+(?:final\\s+)?(?:[\\w.]*\\.)?)${escaped(baseOf(type))}\\b`;
  return new RegExp(`${escaped(operand)}${test}`, 'u').test(masked.slice(0, index));
}

function isImportLine(masked: string, index: number): boolean {
  return /^[ \t]*import\b/u.test(masked.slice(masked.lastIndexOf('\n', index) + 1, index));
}

function castOccurrence({
  masked,
  match,
  operand,
  type,
  detail,
}: {
  masked: string;
  match: RegExpExecArray;
  operand: string;
  type: string;
  detail: string;
}): Occurrence[] {
  if (wasChecked({ masked, index: match.index, operand, type })) return [];
  return [
    { kind: 'type-assertion', key: `as|${type}`, line: lineOfIndex(masked, match.index), detail },
  ];
}

export function kotlinCasts(masked: string): Occurrence[] {
  return [...masked.matchAll(KOTLIN_CAST)].flatMap((match) =>
    isImportLine(masked, match.index)
      ? []
      : castOccurrence({
          masked,
          match,
          operand: operandBefore(masked, endOfCode(masked, match.index)),
          type: capture(match, 1),
          detail: `unsafe cast: as ${capture(match, 1)}`,
        }),
  );
}

function isCastPosition(masked: string, index: number): boolean {
  const before = masked.slice(0, index).trimEnd();
  const word = /(\w+)$/u.exec(before)?.[1];
  const type = /^\s*\(\s*([\w.]+)/u.exec(masked.slice(index))?.[1] ?? '';
  return (word === undefined || BEFORE_CAST.has(word)) && !CONSTANT_NAME.test(type);
}

export function javaCasts(masked: string): Occurrence[] {
  return [...masked.matchAll(JAVA_CAST)].flatMap((match) =>
    isCastPosition(masked, match.index)
      ? castOccurrence({
          masked,
          match,
          operand: /^[\w.]*/u.exec(masked.slice(match.index + match[0].length))?.[0] ?? '',
          type: capture(match, 1),
          detail: `unsafe cast: (${capture(match, 1)})`,
        })
      : [],
  );
}

export function nonNullAssertions(masked: string): Occurrence[] {
  const found: Occurrence[] = [];
  for (let index = masked.indexOf('!!'); index !== -1; index = masked.indexOf('!!', index + 1)) {
    const end = endOfCode(masked, index);
    if (end > 0 && /[\w)\]}"'`]/u.test(masked.charAt(end - 1))) {
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
