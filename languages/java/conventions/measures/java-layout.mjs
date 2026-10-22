import { indentOf, leadingSpaces, majorityStep } from '../../../../shared/conventions/lines.mjs';
import { measuredLineLength, UNBREAKABLE_LINE, withoutRawStrings } from './kotlin-line-length.mjs';

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

function codeLines(text) {
  return withoutRawStrings(text.split(/\r?\n/)).filter(
    (line) => line.trim().length > 0 && !COMMENT_LINE.test(line),
  );
}

function blockChildren(text) {
  const lines = codeLines(text);
  return lines.slice(1).flatMap((line, index) => {
    const previous = lines[index];
    return OPENS_BLOCK.test(previous) ? [{ previous, line }] : [];
  });
}

function spaceSteps(children) {
  return children
    .filter(({ line }) => !line.startsWith('\t'))
    .map(({ previous, line }) => leadingSpaces(line) - leadingSpaces(previous));
}

export function indentationStep(text) {
  return majorityStep(spaceSteps(blockChildren(text)));
}

export function javaIndentation(text) {
  const children = blockChildren(text);
  const steps = spaceSteps(children);
  return children.length - steps.length > steps.length ? 'tab' : majorityStep(steps);
}

function wrappedLineLength(text) {
  return measuredLineLength(text, {
    unbreakable: UNBREAKABLE_LINE,
    joinLengths: wrappedJoinLengths,
    wrappedOnly: true,
  });
}

export function formatterProfile(text) {
  if (javaIndentation(text) === 'tab') {
    return 'none';
  }
  const width = wrappedLineLength(text);
  if (width === undefined) {
    return undefined;
  }
  const step = indentationStep(text);
  if (width === '140' || (step === '2' && width === '120')) {
    return 'none';
  }
  if (step === '2' || (step === '4' && width === '100')) {
    return 'google';
  }
  return step === '4' && width === '120' ? 'palantir' : undefined;
}
