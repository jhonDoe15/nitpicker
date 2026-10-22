import {
  DISCRIMINANT_KEYS,
  MAXIMUM_USES,
  MINIMUM_LENGTH,
  TRANSLATION_CALLS,
  isIdiomaticText,
} from '../../../../../../shared/literals/repeated-literal-exemptions.mjs';
import { braceDepths, closingIndex } from '../kotlin-source.mjs';

const SHOWN_LENGTH = 30;
const BEFORE_WINDOW = 300;
const AFTER_WINDOW = 100;
const LABEL_WINDOW = 2000;
const ALPHANUMERIC = /[A-Za-z0-9]/;
const ANNOTATION = /(?<![\w`])@(?:[A-Za-z_]\w*:)?[A-Za-z_][\w.]*\s*\(/g;
const WHEN_SUBJECT = /\bwhen\s*\(/g;
const WHEN_BODY = /\s*\{/y;
const MARKS = /->|;/g;
const DISCRIMINANTS = new Set(DISCRIMINANT_KEYS);
const TRANSLATION_NAMES = TRANSLATION_CALLS.map((name) => name.replaceAll('$', String.raw`\$`));
const TRANSLATION_KEY = new RegExp(
  String.raw`(?<![\w$])(?:${TRANSLATION_NAMES.join('|')})\s*\(\s*(?:\w+\s*=\s*)?$`,
);
const NAMED_ARGUMENT = /[(,]\s*\w+\s*=\s*$/;
const PAIR_KEY = /^\s+to\s/;
const PAIR_VALUE = /\bto\s+$/;
const SUBSCRIPT_OPEN = /[\w)\]]\s*\[\s*$/;
const SUBSCRIPT_CLOSE = /^\s*\]/;
const ADVICE =
  'Name it once as a constant (`private const val NAME = "..."`) and use the constant.';

function repeatedMessage(subject) {
  return `${subject} is repeated three times or more in the file. ${ADVICE}`;
}

export const REPEATED_STRING_MESSAGE = repeatedMessage('A string');

function lineStart(code, offset) {
  return code.lastIndexOf('\n', offset - 1) + 1;
}

function annotationRanges(code) {
  return [...code.matchAll(ANNOTATION)].map(({ index, 0: text }) => ({
    from: index,
    to: closingIndex(code, index + text.length - 1),
  }));
}

function whenBodies(code) {
  return [...code.matchAll(WHEN_SUBJECT)].flatMap(({ index, 0: text }) => {
    WHEN_BODY.lastIndex = closingIndex(code, index + text.length - 1) + 1;
    const open = WHEN_BODY.exec(code);
    return open === null ? [] : [WHEN_BODY.lastIndex - 1];
  });
}

function continuedLabelStart(code, start, floor) {
  if (start <= floor || code[start - 1] !== '\n') {
    return start;
  }
  const lines = code
    .slice(Math.max(floor, start - LABEL_WINDOW), start)
    .split('\n')
    .slice(0, -1);
  let continued = start;
  for (const line of lines.toReversed()) {
    if (!line.trimEnd().endsWith(',')) {
      break;
    }
    continued -= line.length + 1;
  }
  return continued;
}

function branchLabels(code, depths, open) {
  const bodyDepth = depths[open + 1];
  const marks = [...code.slice(open, closingIndex(code, open)).matchAll(MARKS)]
    .map(({ index, 0: text }) => ({ at: open + index, text }))
    .filter(({ at }) => depths[at] === bodyDepth);
  let floor = open + 1;
  return marks.flatMap(({ at, text }) => {
    if (text === ';') {
      floor = at + 1;
      return [];
    }
    const from = continuedLabelStart(code, Math.max(lineStart(code, at), floor), floor);
    floor = at + 2;
    return [{ from, to: at }];
  });
}

function labelRanges(code) {
  const depths = braceDepths(code);
  return whenBodies(code).flatMap((open) => branchLabels(code, depths, open));
}

function exemptMask(code) {
  const mask = new Uint8Array(code.length + 1);
  for (const { from, to } of [...annotationRanges(code), ...labelRanges(code)]) {
    mask.fill(1, from, to + 1);
  }
  return mask;
}

function isDiscriminantValue(before, windowStart, literalsByEnd) {
  const pair = PAIR_VALUE.exec(before);
  if (pair === null) {
    return false;
  }
  const keyEnd = windowStart + before.slice(0, pair.index).trimEnd().length;
  return DISCRIMINANTS.has(literalsByEnd.get(keyEnd)?.text);
}

function isNamedForm(literal, { code, mask, literalsByEnd }) {
  if (mask[literal.start] === 1) {
    return true;
  }
  const windowStart = Math.max(0, literal.start - BEFORE_WINDOW);
  const before = code.slice(windowStart, literal.start);
  const after = code.slice(literal.end, literal.end + AFTER_WINDOW);
  return (
    TRANSLATION_KEY.test(before) ||
    NAMED_ARGUMENT.test(before) ||
    PAIR_KEY.test(after) ||
    (SUBSCRIPT_OPEN.test(before) && SUBSCRIPT_CLOSE.test(after)) ||
    isDiscriminantValue(before, windowStart, literalsByEnd)
  );
}

function isCountable({ text, template }) {
  return (
    !template && text.length >= MINIMUM_LENGTH && ALPHANUMERIC.test(text) && !isIdiomaticText(text)
  );
}

function shown(text) {
  const oneLine = text.replaceAll(/\s+/g, ' ');
  return oneLine.length > SHOWN_LENGTH ? `${oneLine.slice(0, SHOWN_LENGTH)}...` : oneLine;
}

export function repeatedStringLiterals(scanned) {
  const code = scanned.contextCode;
  const context = {
    code,
    mask: exemptMask(code),
    literalsByEnd: new Map(scanned.literals.map((literal) => [literal.end, literal])),
  };
  const uses = new Map();
  for (const literal of scanned.literals) {
    if (isCountable(literal) && !isNamedForm(literal, context)) {
      const sameText = uses.get(literal.text) ?? [];
      sameText.push(literal);
      uses.set(literal.text, sameText);
    }
  }
  return [...uses.entries()].flatMap(([text, literals]) =>
    literals.slice(MAXIMUM_USES).map((literal) => ({
      rule: 'RepeatedStringLiteral',
      offset: literal.start,
      subject: text,
      message: repeatedMessage(`The string "${shown(text)}"`),
    })),
  );
}
