import { lineStartOf } from '../../../../../shared/fix/recipes/doc-comments/restating-comment.mjs';
import { arrayElements } from './toml-scan.mjs';

const FOUR_SPACES = '    ';

function endOfLine(text, offset) {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline;
}

function endOfContent(text, offset) {
  const end = endOfLine(text, offset);
  return text[end - 1] === '\r' ? end - 1 : end;
}

function indentOf(text, offset) {
  return /^[ \t]*/u.exec(text.slice(lineStartOf(text, offset), offset))[0];
}

function lineEndingOf(text) {
  return /\r\n/u.test(text) ? '\r\n' : '\n';
}

function quoted(requirement) {
  return JSON.stringify(requirement);
}

function appendToMultiline(text, array, requirement) {
  const last = array.elements.at(-1);
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

export function addToArray(text, key, requirementText) {
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
  return { start: last.end, end: last.end, text: `, ${requirement}` };
}

function aloneOnItsLine(text, element) {
  const first = lineStartOf(text, element.start);
  const after = text.slice(element.end, endOfLine(text, element.end));
  const rest = after.replace(/#.*$/u, '').replaceAll(/[\s,]/gu, '');
  return text.slice(first, element.start).trim() === '' && rest === '';
}

export function removeFromArray(text, key, index) {
  const array = arrayElements(text, key);
  const element = array?.elements[index];
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
  const next = array.elements[index + 1];
  const previous = array.elements[index - 1];
  if (next !== undefined) {
    return { start: element.start, end: next.start, text: '' };
  }
  return { start: previous?.end ?? element.start, end: element.end, text: '' };
}

export function removeKeyLines(key) {
  return { start: key.lineStart, end: key.lineEnd, text: '' };
}

export function addTableEntry(text, section, line) {
  const eol = lineEndingOf(text);
  const last = section.keys.at(-1);
  const at = last === undefined ? section.bodyStart : last.lineEnd;
  const lead = at > 0 && !text.slice(0, at).endsWith('\n') ? eol : '';
  return { start: at, end: at, text: `${lead}${line}${eol}` };
}
