import { indentOf, leadingSpaces, majorityStep } from '../../../../shared/conventions/lines.mjs';
import { measuredLineLength, UNBREAKABLE_LINE } from './kotlin-line-length.mjs';

const OPENS_BLOCK = /\{\s*(?:\/\/.*)?$/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const OPENER = /\(\s*$/;
const STATEMENT_END = /[);]\s*$/;
const INNER_SKIP = /[({]\s*$|^\s*(?:\/\/|\/\*|\*|@)/;

function continuation(lines, index) {
  const indent = indentOf(lines[index]);
  const end = lines.findIndex((other, at) => at > index && indentOf(other) <= indent);
  return lines.slice(index + 1, end === -1 ? lines.length : end);
}

function isWrappedCall(inner) {
  return (
    inner.length > 0 &&
    STATEMENT_END.test(inner.at(-1)) &&
    inner.every((line) => indentOf(line) === indentOf(inner[0]) && !INNER_SKIP.test(line))
  );
}

function wrappedJoinLengths(lines) {
  return lines.flatMap((line, index) => {
    const inner = OPENER.test(line) ? continuation(lines, index) : [];
    return isWrappedCall(inner)
      ? [line.trimEnd().length + inner.map((other) => other.trim()).join(' ').length]
      : [];
  });
}

export function javaLineLength(text) {
  return measuredLineLength(text, {
    unbreakable: UNBREAKABLE_LINE,
    joinLengths: wrappedJoinLengths,
  });
}

export function indentationStep(text) {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !COMMENT_LINE.test(line));
  const steps = lines.slice(1).flatMap((line, index) => {
    const previous = lines[index];
    return OPENS_BLOCK.test(previous) && !line.startsWith('\t')
      ? [leadingSpaces(line) - leadingSpaces(previous)]
      : [];
  });
  return majorityStep(steps);
}

const TAB_INDENTED = /^\t/m;

export function formatterProfile(text) {
  if (TAB_INDENTED.test(text)) {
    return 'none';
  }
  const step = indentationStep(text);
  const width = javaLineLength(text);
  if (width === '140' || (step === '2' && width === '120')) {
    return 'none';
  }
  if (step === '2' || (step === '4' && width === '100')) {
    return 'google';
  }
  return step === '4' && width === '120' ? 'palantir' : undefined;
}
