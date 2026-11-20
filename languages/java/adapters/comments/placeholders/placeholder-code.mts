import {
  isNonProductionPath,
  placeholderPhrase,
} from '../../../../../shared/rules/placeholders/placeholder-comments.mts';
import { commentLines } from '../commented-out-code.mts';

type StandIn = { readonly offset: number; readonly subject: string };
type Line = { readonly text: string; readonly start: number };

export const PLACEHOLDER_RULE = 'PlaceholderImplementation';
export const PLACEHOLDER_MESSAGE =
  'The comment calls this code a stand-in for the real work, and the code is one: it returns a fixed value, only sleeps, passes a value on unchanged or does nothing. Do the real work, or throw `UnsupportedOperationException`, so that no caller takes the stand-in for a result. Deleting the comment alone leaves the stand-in in place.';

const EMPTY_VALUES = String.raw`Collections\.empty\w*\(\)|(?:List|Set|Map)\.of\(\)|Optional\.empty\(\)|new \w+(?:<[^()]*>)?\(\)`;
const FIXED_VALUES = String.raw`null|true|false|-?[\d._]+[LlFfDd]?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)'`;
const SHAPES = [
  new RegExp(String.raw`^return\s+(?:${FIXED_VALUES}|${EMPTY_VALUES})\s*;$`, 'u'),
  /^(?:Thread|TimeUnit\.[A-Z_]+)\.sleep\(.*\);$/u,
  /^(?:(?:final )?[A-Z][\w.]*(?:<[^=;()]*>)?(?:\[\])* )?[a-z_]\w* ?= ?(?!(?:null|true|false|this) ?;)[a-z_][\w.]* ?;$/u,
];
const COMMENT_ONLY = /^(?:\/\/|\/\*|\*)/u;
const METHOD_OPENING = /\)(?: throws [\w., ]+)? ?\{$/u;
const CONTROL_OPENING =
  /^(?:\}\s*)?(?:if|else|for|while|do|switch|try|catch|finally|synchronized)\b/u;

function linesOf(source: string): Line[] {
  const starts = [0, ...[...source.matchAll(/\n/gu)].map((match) => match.index + 1)];
  return starts.map((start, index) => ({
    start,
    text: source.slice(start, (starts[index + 1] ?? source.length + 1) - 1),
  }));
}

function isStandIn(code: string): boolean {
  const spaced = code.replaceAll(/\s+/gu, ' ');
  return SHAPES.some((shape) => shape.test(spaced));
}

function closesEmptyMethod(lines: readonly Line[], opening: number, code: string): boolean {
  const header = (lines[opening]?.text ?? '').trim().replaceAll(/\s+/gu, ' ');
  return code === '}' && METHOD_OPENING.test(header) && !CONTROL_OPENING.test(header);
}

function codeBefore(lines: readonly Line[], index: number): number {
  return lines.findLastIndex(
    (line, position) =>
      position < index && line.text.trim() !== '' && !COMMENT_ONLY.test(line.text.trim()),
  );
}

function standInFor(lines: readonly Line[], index: number, offset: number): Line | undefined {
  const line = lines[index];
  const leading = line === undefined ? '' : line.text.slice(0, offset - line.start).trim();
  if (line !== undefined && leading !== '' && !COMMENT_ONLY.test(leading)) {
    return isStandIn(leading) ? line : undefined;
  }
  const next = lines.find(
    (candidate, position) => position > index && !COMMENT_ONLY.test(candidate.text.trim()),
  );
  const code = next?.text.trim() ?? '';
  return isStandIn(code) || closesEmptyMethod(lines, codeBefore(lines, index), code)
    ? next
    : undefined;
}

/** The statements of a Java source that a comment calls a stand-in and that are one by shape. */
export function placeholderCode(source: string, filePath: string): StandIn[] {
  if (isNonProductionPath(filePath)) {
    return [];
  }
  const lines = linesOf(source);
  const found = commentLines(source)
    .filter(({ text }) => placeholderPhrase(text) !== undefined)
    .flatMap(({ offset }) => {
      const index = lines.findLastIndex((line) => line.start <= offset);
      return standInFor(lines, index, offset) ?? [];
    });
  return [...new Set(found)].map((line) => ({
    offset: line.start + (line.text.length - line.text.trimStart().length),
    subject: line.text.trim(),
  }));
}
