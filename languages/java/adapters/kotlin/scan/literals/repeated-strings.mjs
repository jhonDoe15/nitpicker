import { braceDepths, closingIndex } from '../kotlin-source.mjs';

const MINIMUM_LENGTH = 5;
const MAXIMUM_USES = 2;
const SHOWN_LENGTH = 30;
const ALPHANUMERIC = /[A-Za-z0-9]/;
const ANNOTATION = /@(?:[A-Za-z_]\w*:)?[A-Za-z_][\w.]*\s*\(/g;
const WHEN_SUBJECT = /\bwhen\s*\(/g;
const ARROW = /->/g;
const TRANSLATION_CALLS = [
  '_',
  '__',
  '_t',
  't',
  'translate',
  'formatMessage',
  'getMessage',
  'getString',
  'getTranslations',
  'getFixedT',
  'useTranslation',
  'useTranslations',
  'gettext',
  'ngettext',
  'pgettext',
];
const TRANSLATION_KEY = new RegExp(
  String.raw`(?<![\w$])(?:${TRANSLATION_CALLS.join('|')})\s*\(\s*(?:\w+\s*=\s*)?$`,
);
const CONSTANT_DECLARATION = /\bconst\s+val\s+\w+(?:\s*:\s*[\w.<>?]+)?\s*=\s*$/;
const NAMED_ARGUMENT = /[(,]\s*\w+\s*=\s*$/;
const PAIR_KEY = /^\s+to\s/;
const PAIR_VALUE = /\bto\s+$/;
const SUBSCRIPT_OPEN = /[\w)\]]\s*\[\s*$/;
const SUBSCRIPT_CLOSE = /^\s*\]/;
const DISCRIMINANT_KEYS = new Set(['type', 'kind', 'tag', 'variant']);

const ADVICE =
  'Name it once as a constant (`private const val NAME = "..."`) and use the constant.';

export const REPEATED_STRING_MESSAGE = `A string is repeated three times or more in the file. ${ADVICE}`;

function annotationRanges(code) {
  return [...code.matchAll(ANNOTATION)].map(({ index, 0: text }) => ({
    from: index,
    to: closingIndex(code, index + text.length - 1),
  }));
}

function lineStart(code, offset) {
  return code.lastIndexOf('\n', offset - 1) + 1;
}

function labelStart(code, arrow) {
  const arrowLine = lineStart(code, arrow);
  const earlier = code.slice(0, arrowLine).split('\n').slice(0, -1).toReversed();
  let start = arrowLine;
  for (const line of earlier) {
    if (!line.trimEnd().endsWith(',')) {
      break;
    }
    start -= line.length + 1;
  }
  return start;
}

function whenBodies(code) {
  return [...code.matchAll(WHEN_SUBJECT)].flatMap(({ index, 0: text }) => {
    const afterSubject = closingIndex(code, index + text.length - 1) + 1;
    const open = /^\s*\{/.exec(code.slice(afterSubject));
    return open === null ? [] : [{ open: afterSubject + open[0].length - 1 }];
  });
}

function labelRanges(code) {
  const depths = braceDepths(code);
  return whenBodies(code).flatMap(({ open }) => {
    const close = closingIndex(code, open);
    return [...code.slice(open, close).matchAll(ARROW)]
      .map(({ index }) => open + index)
      .filter((arrow) => depths[arrow] === depths[open + 1])
      .map((arrow) => ({ from: labelStart(code, arrow), to: arrow }));
  });
}

function within(ranges, offset) {
  return ranges.some(({ from, to }) => offset >= from && offset <= to);
}

function discriminantValue(scanned, before) {
  const pair = PAIR_VALUE.exec(before);
  if (pair === null) {
    return false;
  }
  const key = scanned.literals.find(
    ({ end }) => end === before.slice(0, pair.index).trimEnd().length,
  );
  return key !== undefined && DISCRIMINANT_KEYS.has(key.text);
}

function isNamedForm(scanned, literal, ranges) {
  const before = scanned.code.slice(0, literal.start);
  const after = scanned.code.slice(literal.end);
  return (
    within(ranges.annotations, literal.start) ||
    within(ranges.labels, literal.start) ||
    TRANSLATION_KEY.test(before) ||
    CONSTANT_DECLARATION.test(before) ||
    NAMED_ARGUMENT.test(before) ||
    PAIR_KEY.test(after) ||
    (SUBSCRIPT_OPEN.test(before) && SUBSCRIPT_CLOSE.test(after)) ||
    discriminantValue(scanned, before)
  );
}

function isCountable(literal) {
  return (
    !literal.template && literal.text.length >= MINIMUM_LENGTH && ALPHANUMERIC.test(literal.text)
  );
}

function shown(text) {
  const oneLine = text.replaceAll(/\s+/g, ' ');
  return oneLine.length > SHOWN_LENGTH ? `${oneLine.slice(0, SHOWN_LENGTH)}...` : oneLine;
}

export function repeatedStringLiterals(scanned) {
  const ranges = { annotations: annotationRanges(scanned.code), labels: labelRanges(scanned.code) };
  const uses = new Map();
  for (const literal of scanned.literals) {
    if (isCountable(literal) && !isNamedForm(scanned, literal, ranges)) {
      uses.set(literal.text, [...(uses.get(literal.text) ?? []), literal]);
    }
  }
  return [...uses.entries()].flatMap(([text, literals]) =>
    literals.slice(MAXIMUM_USES).map((literal) => ({
      rule: 'RepeatedStringLiteral',
      offset: literal.start,
      subject: text,
      message: `The string "${shown(text)}" is repeated three times or more in the file. ${ADVICE}`,
    })),
  );
}
