import { closingIndex } from '../kotlin-source.mts';
import { ends, isBlockStatement, standsFree } from './kotlin-context.mts';
import {
  bare,
  chainOperator,
  chainParts,
  flippedComparison,
  foldable,
  negated,
  negatedOperand,
  printed,
  trimmed,
  view,
} from './kotlin-operands.mts';
import type { Piece, PrintScan } from './kotlin-operands.mts';
import type { Comment, Scanned } from '../typed/scan-shapes.mts';

type Branch = { length: number; returns: boolean; literal: string | undefined };
type Pair = {
  first: { literal: string | undefined };
  second: { literal: string | undefined };
  returns: boolean;
  end?: number;
};
type Report = { rule: string; offset: number; subject: string; message: string };
type Located = { found: Report; open: number; close: number };
type Head = { start: number; open: number; close: number };

const RULE = 'SimplerBooleanLogic';
const IF_HEAD = /(?<![\w.])if\s*\(/g;
const NEGATED_GROUP = /(?<![\w)\]!])!\s*\(/g;
const GROUP = /\(/g;
const RETURN_VALUE = /(?<![\w.@])return\s+([^\n;{}]+)/g;
const ASSIGNED_VALUE = /(?<![=!<>+\-*/%])=(?!=)\s*([^\n;{}]+)/g;
const ELSE = /^\s*else\b(?!\s*->)/;
const ELSE_IF = /^\s*else\s+if\b/;
const LITERAL_BRANCH = /^\s*(\{\s*)?(return\s+)?(true|false)\b/;
const NEXT_RETURN = /^\s*(?:;\s*)?return\s+(true|false)\b/;
const STOPS = /(?<![\w.])(?:if|when|else)\b|[;{}]/;
const BRACKET_STEPS = new Map<string, number>([
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

function report(offset: number, form: string, swapped = false): Report {
  const note = swapped ? ', with the two branches swapped' : '';
  return {
    rule: RULE,
    offset,
    subject: form,
    message: `Write this boolean logic in its simpler exact form: \`${form}\`${note}.`,
  };
}

function literalBranch(code: string): Branch | undefined {
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
    literal: match[3] ?? '',
  };
}

function literalPair(
  code: string,
  { start, close }: { start: number; close: number },
): Pair | undefined {
  const rest = code.slice(close + 1);
  const first = literalBranch(rest);
  if (first === undefined) {
    return undefined;
  }
  const afterFirst = rest.slice(first.length);
  const elseMatch = ELSE.exec(afterFirst);
  if (elseMatch !== null) {
    const tail = afterFirst.slice(elseMatch[0].length);
    const second = literalBranch(tail);
    const valid =
      second !== undefined && second.returns === first.returns && ends(tail.slice(second.length));
    const end = code.length - tail.length + (second?.length ?? 0);
    return valid ? { first, second, returns: first.returns, end } : undefined;
  }
  const next =
    first.returns && isBlockStatement(code, start)
      ? (NEXT_RETURN.exec(afterFirst) ?? undefined)
      : undefined;
  return next !== undefined && ends(afterFirst.slice(next[0].length))
    ? { first, second: { literal: next[1] }, returns: true }
    : undefined;
}

function simplest(condition: Piece): string {
  const operand = negatedOperand(condition);
  return operand === undefined ? printed(condition) : negated(bare(operand));
}

function booleanReturn(scanned: PrintScan, { start, open, close }: Head): Report | undefined {
  const pair = literalPair(scanned.code, { start, close });
  const condition = view(scanned, open + 1, close);
  if (
    pair === undefined ||
    pair.first.literal === pair.second.literal ||
    !foldable(condition) ||
    !(pair.returns || standsFree(scanned.code, start, pair.end ?? 0))
  ) {
    return undefined;
  }
  const value = pair.first.literal === 'true' ? simplest(condition) : negated(condition);
  return report(open, pair.returns ? `return ${value}` : value);
}

function thenBranchEnd(code: string, close: number): { end: number; block: boolean } | undefined {
  const start = close + 1 + (/^\s*/.exec(code.slice(close + 1))?.[0].length ?? 0);
  if (code[start] === '{') {
    return { end: closingIndex(code, start) + 1, block: true };
  }
  const rest = code.slice(start);
  const elseAt = rest.search(/(?<![\w.])else\b/);
  const between = elseAt === -1 ? '' : rest.slice(0, elseAt);
  return elseAt === -1 || STOPS.test(between) ? undefined : { end: start + elseAt, block: false };
}

function swappedIf(scanned: PrintScan, open: number, close: number): Report | undefined {
  const { code } = scanned;
  const operand = negatedOperand(view(scanned, open + 1, close));
  const branch =
    operand === undefined || !foldable(operand) ? undefined : thenBranchEnd(code, close);
  const rest = branch === undefined ? '' : code.slice(branch.end);
  if (operand === undefined || branch === undefined || !ELSE.test(rest) || ELSE_IF.test(rest)) {
    return undefined;
  }
  const head = `if (${printed(bare(operand))})`;
  return report(open, branch.block ? `${head} { … } else { … }` : `${head} … else …`, true);
}

function ifFindings(scanned: PrintScan): Located[] {
  return [...scanned.code.matchAll(IF_HEAD)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(scanned.code, open);
    const found =
      booleanReturn(scanned, { start: match.index, open, close }) ??
      swappedIf(scanned, open, close);
    return found === undefined ? [] : [{ found: { ...found, offset: match.index }, open, close }];
  });
}

function comparisonFindings(scanned: PrintScan, conditions: Located[]): Report[] {
  return [...scanned.code.matchAll(NEGATED_GROUP)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(scanned.code, open);
    const group = view(scanned, open + 1, close);
    const form =
      foldable(group) && standsFree(scanned.code, match.index, close + 1)
        ? flippedComparison(group)
        : undefined;
    const inReported = conditions.some(
      (condition) => condition.open < open && open < condition.close,
    );
    return form === undefined || inReported ? [] : [report(match.index, form)];
  });
}

function unwrapped(piece: Piece, operator: string): string {
  const whole = trimmed(piece);
  const grouped =
    whole.code.startsWith('(') && closingIndex(whole.code, 0) === whole.code.length - 1;
  const inner = { code: whole.code.slice(1, -1), text: whole.text.slice(1, -1) };
  return grouped && chainOperator(inner) === operator ? printed(inner) : printed(whole);
}

function factored(piece: Piece): string | undefined {
  const operator = foldable(piece) ? chainOperator(piece) : undefined;
  const parts = operator === undefined ? [] : chainParts(piece, operator).map(negatedOperand);
  const operands = parts.flatMap((operand) => (operand === undefined ? [] : [operand]));
  if (operands.length === 0 || operands.length !== parts.length) {
    return undefined;
  }
  const flipped = operator === '&&' ? '||' : '&&';
  return `!(${operands.map((operand) => unwrapped(operand, flipped)).join(` ${flipped} `)})`;
}

function valueLength(code: string): number {
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

function factoredFindings(scanned: PrintScan): Report[] {
  const { code } = scanned;
  const groups = [...code.matchAll(GROUP)].map(({ index }) => ({
    start: index + 1,
    end: closingIndex(code, index),
  }));
  const values = [...code.matchAll(RETURN_VALUE), ...code.matchAll(ASSIGNED_VALUE)]
    .map((match) => {
      const value = match[1] ?? '';
      const start = match.index + match[0].length - value.length;
      return { start, end: start + valueLength(value) };
    })
    .filter(({ end }) => ends(code.slice(end)));
  return [...groups, ...values].flatMap(({ start, end }) => {
    const form = factored(view(scanned, start, end));
    return form === undefined ? [] : [report(start, form)];
  });
}

function withoutComments(source: string, comments: Comment[]): string {
  return comments.reduce(
    (text, { start, end }) =>
      text.slice(0, start) + text.slice(start, end).replaceAll(/[^\n]/g, ' ') + text.slice(end),
    source,
  );
}

export function simplerBooleanLogic(scanned: Scanned): Report[] {
  const withText: PrintScan = {
    ...scanned,
    printable: withoutComments(scanned.source, scanned.comments),
  };
  const conditions = ifFindings(withText);
  return [
    ...conditions.map(({ found }) => found),
    ...comparisonFindings(withText, conditions),
    ...factoredFindings(withText),
  ];
}

export const kotlinSourceRules = {
  messages: MESSAGES,
  main: [simplerBooleanLogic],
  test: [simplerBooleanLogic],
};
