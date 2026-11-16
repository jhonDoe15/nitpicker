import { lineStartOf as untypedLineStartOf } from '../../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';
import type {
  TextEdit,
  TomlArray,
  TomlElement,
  TomlKey,
  TomlSection,
} from '../../typed/fix-types.mts';
import { arrayElements } from './toml-scan.mts';

const FOUR_SPACES = '    ';
const lineStartOf: (text: string, offset: number) => number = untypedLineStartOf;

function endOfLine(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline;
}

function endOfContent(text: string, offset: number): number {
  const end = endOfLine(text, offset);
  return text[end - 1] === '\r' ? end - 1 : end;
}

function indentOf(text: string, offset: number): string {
  return /^[ \t]*/u.exec(text.slice(lineStartOf(text, offset), offset))?.[0] ?? '';
}

function lineEndingOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function quoted(requirement: string): string {
  return JSON.stringify(requirement);
}

function appendToMultiline(text: string, array: TomlArray, requirement: string): TextEdit {
  const last: TomlElement = array.elements.at(-1) ?? { start: 0, end: 0, raw: '', value: '' };
  const indent =
    indentOf(text, last.start).trim() === '' ? indentOf(text, last.start) : FOUR_SPACES;
  const lineEnd = Math.min(endOfContent(text, last.end), array.close);
  const after = text.slice(last.end, lineEnd);
  const eol = lineEndingOf(text);
  if (/^[ \t]*,/u.test(after)) {
    return { start: lineEnd, end: lineEnd, text: `${eol}${indent}${requirement},` };
  }
  return { start: last.end, end: lineEnd, text: `,${after}${eol}${indent}${requirement}` };
}

export function addToArray(
  text: string,
  key: TomlKey,
  requirementText: string,
): TextEdit | undefined {
  const array = arrayElements(text, key);
  if (array === undefined) {
    return undefined;
  }
  const requirement = requirementText.startsWith('"') ? requirementText : quoted(requirementText);
  const multiline = text.slice(array.open, array.close).includes('\n');
  if (array.elements.length === 0) {
    const eol = lineEndingOf(text);
    const inserted = multiline
      ? `${eol}${indentOf(text, key.lineStart) + FOUR_SPACES}${requirement},`
      : requirement;
    return { start: array.open + 1, end: array.open + 1, text: inserted };
  }
  if (multiline) {
    return appendToMultiline(text, array, requirement);
  }
  const last = array.elements.at(-1);
  return { start: last?.end ?? 0, end: last?.end ?? 0, text: `, ${requirement}` };
}

function aloneOnItsLine(text: string, element: TomlElement): boolean {
  const first = lineStartOf(text, element.start);
  const after = text.slice(element.end, endOfLine(text, element.end));
  const rest = after.replace(/#.*$/u, '').replaceAll(/[\s,]/gu, '');
  return text.slice(first, element.start).trim() === '' && rest === '';
}

export function removeFromArray(
  text: string,
  key: TomlKey | undefined,
  index: number | undefined,
): TextEdit | undefined {
  const array = key === undefined ? undefined : arrayElements(text, key);
  const element = index === undefined ? undefined : array?.elements[index];
  if (element === undefined) {
    return undefined;
  }
  if (aloneOnItsLine(text, element)) {
    const end = endOfLine(text, element.end);
    return {
      start: lineStartOf(text, element.start),
      end: Math.min(end + 1, text.length),
      text: '',
    };
  }
  const next = array?.elements[(index ?? 0) + 1];
  const previous = array?.elements[(index ?? 0) - 1];
  if (next !== undefined) {
    return { start: element.start, end: next.start, text: '' };
  }
  return { start: previous?.end ?? element.start, end: element.end, text: '' };
}

export function removeKeyLines(key: TomlKey | undefined): TextEdit | undefined {
  return key === undefined ? undefined : { start: key.lineStart, end: key.lineEnd, text: '' };
}

export function addTableEntry(text: string, section: TomlSection, line: string): TextEdit {
  const eol = lineEndingOf(text);
  const last = section.keys.at(-1);
  const at = last === undefined ? section.bodyStart : last.lineEnd;
  const lead = at > 0 && !text.slice(0, at).endsWith('\n') ? eol : '';
  return { start: at, end: at, text: `${lead}${line}${eol}` };
}
