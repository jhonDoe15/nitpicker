import { closingIndex } from '../kotlin-source.mjs';
import {
  chainOperator,
  chainParts,
  flippedComparison,
  negated,
  negatedOperand,
  printed,
  trimmed,
  view,
} from './kotlin-operands.mjs';

const RULE = 'SimplerBooleanLogic';
const IF_HEAD = /(?<![\w.])if\s*\(/g;
const NEGATED_GROUP = /(?<![\w)\]!])!\s*\(/g;
const GROUP = /\(/g;
const RETURN_VALUE = /(?<![\w.@])return\s+([^\n;{}]+)/g;
const ASSIGNED_VALUE = /(?<![=!<>+\-*/%])=(?!=)\s*([^\n;{}]+)/g;
const CONTINUED = /^\s*(?:&&|\|\||\?:|\?\.|\.|[+\-*/%<>=!]|(?:as|is|in)\b)/;
const ELSE = /^\s*else\b/;
const ELSE_IF = /^\s*else\s+if\b/;
const LITERAL_BRANCH = /^\s*(\{\s*)?(return\s+)?(true|false)\b/;
const NEXT_RETURN = /^\s*(?:;\s*)?return\s+(true|false)\b/;
const STOPS = /(?<![\w.])(?:if|when|else)\b|[;{}]/;
const BRACKET_STEPS = new Map([
  ['(', 1],
  ['[', 1],
  ['{', 1],
  [')', -1],
  [']', -1],
  ['}', -1],
]);

const MESSAGES = {
  [RULE]:
    'Write this boolean logic in its simpler exact form; the finding prints it. A Kotlin condition is a non-null `Boolean`, so each form keeps the value.',
};

function report(offset, form, swapped = false) {
  const note = swapped ? ', with the two branches swapped' : '';
  return {
    rule: RULE,
    offset,
    subject: form,
    message: `Write this boolean logic in its simpler exact form: \`${form}\`${note}.`,
  };
}

function ends(code) {
  return !CONTINUED.test(code);
}

function literalBranch(code) {
  const match = LITERAL_BRANCH.exec(code);
  if (match === null) {
    return undefined;
  }
  const closed =
    match[1] === undefined ? '' : (/^\s*\}/.exec(code.slice(match[0].length))?.[0] ?? '');
  if (match[1] !== undefined && closed === '') {
    return undefined;
  }
  return {
    length: match[0].length + closed.length,
    returns: match[2] !== undefined,
    literal: match[3],
  };
}

function literalPair(code, close) {
  const rest = code.slice(close + 1);
  const first = literalBranch(rest);
  const afterFirst = first === undefined ? '' : rest.slice(first.length);
  const elseMatch = ELSE.exec(afterFirst);
  if (elseMatch !== null) {
    const tail = afterFirst.slice(elseMatch[0].length);
    const second = literalBranch(tail);
    const valid =
      second !== undefined && second.returns === first.returns && ends(tail.slice(second.length));
    return valid ? { first, second, returns: first.returns } : undefined;
  }
  const next = first?.returns === true ? (NEXT_RETURN.exec(afterFirst) ?? undefined) : undefined;
  return next !== undefined && ends(afterFirst.slice(next[0].length))
    ? { first, second: { literal: next[1] }, returns: true }
    : undefined;
}

function booleanReturn(scanned, open, close) {
  const pair = literalPair(scanned.code, close);
  if (pair === undefined || pair.first.literal === pair.second.literal) {
    return undefined;
  }
  const condition = view(scanned, open + 1, close);
  const value = pair.first.literal === 'true' ? printed(condition) : negated(condition);
  return report(open, pair.returns ? `return ${value}` : value);
}

function thenBranchEnd(code, close) {
  const start = close + 1 + (/^\s*/.exec(code.slice(close + 1))?.[0].length ?? 0);
  if (code[start] === '{') {
    return { end: closingIndex(code, start) + 1, block: true };
  }
  const rest = code.slice(start);
  const elseAt = rest.search(/(?<![\w.])else\b/);
  const between = elseAt === -1 ? '' : rest.slice(0, elseAt);
  return elseAt === -1 || STOPS.test(between) ? undefined : { end: start + elseAt, block: false };
}

function swappedIf(scanned, open, close) {
  const { code } = scanned;
  const operand = negatedOperand(view(scanned, open + 1, close));
  const branch = operand === undefined ? undefined : thenBranchEnd(code, close);
  const rest = branch === undefined ? '' : code.slice(branch.end);
  if (!ELSE.test(rest) || ELSE_IF.test(rest)) {
    return undefined;
  }
  const head = `if (${printed(operand)})`;
  return report(open, branch.block ? `${head} { … } else { … }` : `${head} … else …`, true);
}

function ifFindings(scanned) {
  return [...scanned.code.matchAll(IF_HEAD)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(scanned.code, open);
    const found = booleanReturn(scanned, open, close) ?? swappedIf(scanned, open, close);
    return found === undefined ? [] : [{ ...found, offset: match.index }];
  });
}

function comparisonFindings(scanned) {
  return [...scanned.code.matchAll(NEGATED_GROUP)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const form = flippedComparison(view(scanned, open + 1, closingIndex(scanned.code, open)));
    return form === undefined ? [] : [report(match.index, form)];
  });
}

function unwrapped(piece, operator) {
  const whole = trimmed(piece);
  const grouped =
    whole.code.startsWith('(') && closingIndex(whole.code, 0) === whole.code.length - 1;
  const inner = { code: whole.code.slice(1, -1), text: whole.text.slice(1, -1) };
  return grouped && chainOperator(inner) === operator ? printed(inner) : printed(whole);
}

function factored(piece) {
  const operator = chainOperator(piece);
  const operands = operator === undefined ? [] : chainParts(piece, operator).map(negatedOperand);
  if (operands.length === 0 || operands.includes(undefined)) {
    return undefined;
  }
  const flipped = operator === '&&' ? '||' : '&&';
  return `!(${operands.map((operand) => unwrapped(operand, flipped)).join(` ${flipped} `)})`;
}

function valueLength(code) {
  let depth = 0;
  for (const { index, 0: mark } of code.matchAll(/[()[\]{},]/g)) {
    if (mark === ',' && depth === 0) {
      return index;
    }
    depth += BRACKET_STEPS.get(mark) ?? 0;
    if (depth < 0) {
      return index;
    }
  }
  return code.length;
}

function factoredFindings(scanned) {
  const { code } = scanned;
  const groups = [...code.matchAll(GROUP)].map(({ index }) => ({
    start: index + 1,
    end: closingIndex(code, index),
  }));
  const values = [...code.matchAll(RETURN_VALUE), ...code.matchAll(ASSIGNED_VALUE)]
    .map((match) => {
      const start = match.index + match[0].length - match[1].length;
      return { start, end: start + valueLength(match[1]) };
    })
    .filter(({ end }) => ends(code.slice(end)));
  return [...groups, ...values].flatMap(({ start, end }) => {
    const form = factored(view(scanned, start, end));
    return form === undefined ? [] : [report(start, form)];
  });
}

function withoutComments(source, comments) {
  return comments.reduce(
    (text, { start, end }) =>
      text.slice(0, start) + text.slice(start, end).replaceAll(/[^\n]/g, ' ') + text.slice(end),
    source,
  );
}

/** Boolean logic with a strictly simpler exact form, each finding printing that form. */
export function simplerBooleanLogic(scanned) {
  const withText = { ...scanned, printable: withoutComments(scanned.source, scanned.comments) };
  return [...ifFindings(withText), ...comparisonFindings(withText), ...factoredFindings(withText)];
}

export const kotlinSourceRules = {
  messages: MESSAGES,
  main: [simplerBooleanLogic],
  test: [simplerBooleanLogic],
};
