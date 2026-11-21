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

const EMPTY_VALUES = String.raw`Collections\.empty\w*\(\)|(?:List|Set|Map)\.of\(\)|Optional\.empty\(\)|new (?:Array|Linked|Hash|Tree)\w+(?:<[^()]*>)?\(\)`;
const FIXED_VALUES = String.raw`null|true|false|-?[\d._]+[LlFfDd]?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)'`;
const FIXED_RETURN = new RegExp(String.raw`^return (?:${FIXED_VALUES}|${EMPTY_VALUES}) ?;$`, 'u');
const DECLARED_TYPE = String.raw`(?:final )?(?:int|long|double|float|boolean|[A-Z][\w.]*(?:<[^=;()]*>)?)(?:\[\])*`;
const SHAPES = [
  /^(?:Thread|TimeUnit\.[A-Z_]+)\.sleep\(.*\);$/u,
  new RegExp(
    String.raw`^(?:${DECLARED_TYPE} )?[a-z_]\w* ?= ?(?!(?:null|true|false|this) ?;)[a-z_]\w* ?;$`,
    'u',
  ),
];
const COMMENT_ONLY = /^(?:\/\/|\/\*|\*)/u;
const METHOD_HEADER =
  /^(?!(?:new|return|throw|else|do|try) )(?:@?[\w.]+(?:<[^()]*>)?(?:\[\])* )+\w+\([^()]*\)(?: throws [\w., ]+)? ?\{$/u;

function linesOf(source: string): Line[] {
  const starts = [0, ...[...source.matchAll(/\n/gu)].map((match) => match.index + 1)];
  return starts.map((start, index) => ({
    start,
    text: source.slice(start, (starts[index + 1] ?? source.length + 1) - 1),
  }));
}

function spaced(line: Line | undefined): string {
  return (line?.text ?? '').trim().replaceAll(/\s+/gu, ' ');
}

function opensOtherBlock(header: string): boolean {
  return header.endsWith('{') && !METHOD_HEADER.test(header);
}

function isStandIn(code: string, header: string): boolean {
  return (
    SHAPES.some((shape) => shape.test(code)) ||
    (FIXED_RETURN.test(code) && !opensOtherBlock(header)) ||
    (code === '}' && METHOD_HEADER.test(header))
  );
}

function codeBefore(lines: readonly Line[], index: number): Line | undefined {
  return lines.findLast(
    (line, position) =>
      position < index && line.text.trim() !== '' && !COMMENT_ONLY.test(line.text.trim()),
  );
}

function standInFor(lines: readonly Line[], index: number, offset: number): Line | undefined {
  const line = lines[index];
  const leading = line === undefined ? '' : line.text.slice(0, offset - line.start).trim();
  const header = spaced(codeBefore(lines, index));
  if (
    line !== undefined &&
    leading !== '' &&
    !COMMENT_ONLY.test(leading) &&
    !leading.endsWith('{')
  ) {
    return isStandIn(leading.replaceAll(/\s+/gu, ' '), header) ? line : undefined;
  }
  const next = lines.find(
    (candidate, position) => position > index && !COMMENT_ONLY.test(candidate.text.trim()),
  );
  return isStandIn(
    spaced(next),
    leading.endsWith('{') ? spaced({ text: leading, start: 0 }) : header,
  )
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
