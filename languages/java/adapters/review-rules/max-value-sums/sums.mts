import { backward, between, forward, frameAt, startsNewLine } from './source-file.mts';
import { accessorName, lookup, refAt, valueKind } from './values/values.mts';
import { isComparison, usedAsBound, usedLater } from './sinks.mts';
import type {
  CarrierState,
  Context,
  FoundSum,
  Operand,
  SourceFile,
  Span,
  Sum,
} from './sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

const DELIMITERS = new Set([
  ',',
  ';',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  '=',
  '&&',
  '||',
  '?',
  ':',
  '->',
  '+=',
  '-=',
  '*=',
  '/=',
  '?:',
  '!',
  'return',
  'val',
  'var',
  'in',
  'until',
  'downTo',
  '..',
  '..<',
  'else',
  'case',
  'throw',
  'is',
]);
const ADDITIVE = ['+', '-'];
const FACTORS = ['+', '-', '*', '/', '%'];
const CLAMPS = new Set([
  'min',
  'max',
  'minOf',
  'maxOf',
  'coerceAtMost',
  'coerceIn',
  'addExact',
  'multiplyExact',
]);

function stopsAt(token: Token | undefined, extra: readonly string[]): boolean {
  const text = token?.text ?? '';
  return DELIMITERS.has(text) || isComparison(text) || extra.includes(text);
}

function spanBack(source: SourceFile, last: number, extra: readonly string[]): Span {
  let from = last + 1;
  for (const { index, start, group } of backward(source, last)) {
    if (!group && stopsAt(source.tokens[index], extra)) {
      break;
    }
    from = start;
  }
  return { from, to: last + 1 };
}

function spanForward(source: SourceFile, first: number, extra: readonly string[]): Span {
  const { tokens } = source;
  let to = first;
  for (const { index, end, group } of forward(source, first)) {
    const stops = stopsAt(tokens[index], extra) || (index > first && startsNewLine(tokens, index));
    if (!group && stops) {
      break;
    }
    to = end;
  }
  return { from: first, to };
}

function widened(source: SourceFile, { from, to }: Span): boolean {
  const texts = source.tokens.slice(from, to);
  const cast =
    ['long', 'Long'].includes(texts[1]?.text ?? '') &&
    texts[0]?.text === '(' &&
    texts[2]?.text === ')';
  return (
    cast ||
    texts.some(({ text, kind }) => text === 'toLong' || (kind === 'number' && /[lL]$/u.test(text)))
  );
}

function statementTexts(source: SourceFile, from: number): string[] {
  const { tokens } = source;
  const rest = tokens.slice(from);
  const stop = rest.findIndex(
    (token, offset) => token.text === ';' || (offset > 0 && startsNewLine(tokens, from + offset)),
  );
  return rest.slice(0, stop === -1 ? rest.length : stop).map(({ text }) => text);
}

function sentinelSide(state: CarrierState, context: Context, side: Span): boolean {
  const { tokens } = context.source;
  const sentinel = valueKind(state, context, side) !== undefined;
  return sentinel || tokens.slice(side.from, side.to).some(({ text }) => text === '-');
}

function chainStart(tokens: readonly Token[], index: number): number {
  const starts = [index];
  for (const start of starts) {
    if (tokens[start - 1]?.text === '.' && tokens[start - 2]?.kind === 'identifier') {
      starts.push(start - 2);
    }
  }
  return starts.at(-1) ?? index;
}

function boundCompared(
  state: CarrierState,
  context: Context,
  { start, end }: { start: number; end: number },
): boolean {
  const { source } = context;
  const { tokens } = source;
  const after = isComparison(tokens[end + 1]?.text);
  if (!(after || isComparison(tokens[start - 1]?.text))) {
    return false;
  }
  const side = after ? spanForward(source, end + 2, []) : spanBack(source, start - 2, []);
  return sentinelSide(state, context, side);
}

function accessorEnd(tokens: readonly Token[], index: number, name: string): number | undefined {
  const call = tokens[index + 1]?.text === '(' && tokens[index + 2]?.text === ')';
  if (tokens[index]?.text === name) {
    return index;
  }
  return call && accessorName(tokens[index]?.text ?? '') === name ? index + 2 : undefined;
}

function guardedAt(
  state: CarrierState,
  context: Context,
  { index, name }: { index: number; name: string },
): boolean {
  const { source } = context;
  const { tokens } = source;
  const open = source.opener[index] ?? -1;
  const clamped = open >= 0 && CLAMPS.has(tokens[open - 1]?.text ?? '');
  const reassigned =
    tokens[index + 1]?.text === '=' &&
    statementTexts(source, index + 2).some((text) => CLAMPS.has(text));
  const end = accessorEnd(tokens, index, name);
  return (
    end !== undefined &&
    (clamped ||
      reassigned ||
      boundCompared(state, context, { start: chainStart(tokens, index), end }))
  );
}

function guarded(
  state: CarrierState,
  context: Context,
  { name, before }: { name: string; before: number },
): boolean {
  return between(context.frame?.open ?? 0, before).some((index) =>
    guardedAt(state, context, { index, name }),
  );
}

function operandOf(state: CarrierState, context: Context, span: Span): Operand | undefined {
  const ref = refAt(context.source, span.from);
  const kind = ref !== undefined && ref.end === span.to ? lookup(state, context, ref) : undefined;
  return ref === undefined || kind === undefined ? undefined : { name: ref.name, kind };
}

function storedAs(source: SourceFile, expression: Span): string | undefined {
  const { tokens } = source;
  const name = tokens[expression.from - 2];
  const assigned = tokens[expression.from - 1]?.text === '=' && name?.kind === 'identifier';
  return assigned ? name.text : undefined;
}

function reported(
  source: SourceFile,
  { frame, expression }: { frame: Context['frame']; expression: Span },
): boolean {
  if (usedAsBound(source, expression)) {
    return true;
  }
  const stored = storedAs(source, expression);
  return (
    stored !== undefined &&
    usedLater(source, { name: stored, from: expression.to, to: frame?.body.to ?? 0 })
  );
}

function simpleSum(state: CarrierState, source: SourceFile, index: number): Sum | undefined {
  const frame = frameAt(source, index);
  const operator = source.tokens[index]?.text ?? '';
  const additive = operator === '+';
  const context = { source, frame };
  const left = spanBack(source, index - 1, additive ? [] : ADDITIVE);
  const right = spanForward(source, index + 1, additive ? ADDITIVE : FACTORS);
  const whole = {
    from: spanBack(source, index - 1, []).from,
    to: spanForward(source, index + 1, []).to,
  };
  const onLeft = operandOf(state, context, left);
  const operand = onLeft ?? operandOf(state, context, right);
  const safe =
    operand === undefined ||
    (operand.kind === 'int' && widened(source, onLeft === undefined ? left : right)) ||
    guarded(state, context, { name: operand.name, before: whole.from });
  return safe || !reported(source, { frame, expression: whole })
    ? undefined
    : { operand, text: `${text(source, left)} ${operator} ${text(source, right)}` };
}

function assignedSum(state: CarrierState, source: SourceFile, index: number): Sum | undefined {
  const frame = frameAt(source, index);
  const context = { source, frame };
  const left = spanBack(source, index - 1, []);
  const right = spanForward(source, index + 1, []);
  const operand = operandOf(state, context, left) ?? operandOf(state, context, right);
  const target = source.tokens[index - 1];
  const safe =
    operand === undefined ||
    target === undefined ||
    target.kind !== 'identifier' ||
    (operand.kind === 'int' && widened(source, right)) ||
    guarded(state, context, { name: operand.name, before: left.from });
  const used =
    !safe && usedLater(source, { name: target.text, from: right.to, to: frame?.body.to ?? 0 });
  return used
    ? {
        operand,
        text: `${text(source, left)} ${source.tokens[index]?.text ?? ''} ${text(source, right)}`,
      }
    : undefined;
}

function text(source: SourceFile, { from, to }: Span): string {
  return source.tokens
    .slice(from, to)
    .map((token) => token.text)
    .join('')
    .replaceAll(',', ', ');
}

const BINARY_BEFORE = new Set([')', ']']);

function isBinary(source: SourceFile, index: number): boolean {
  const before = source.tokens[index - 1];
  return (
    before !== undefined &&
    (['identifier', 'number'].includes(before.kind) || BINARY_BEFORE.has(before.text))
  );
}

export function findSums(state: CarrierState, source: SourceFile): FoundSum[] {
  const found: FoundSum[] = [];
  for (const [index, token] of source.tokens.entries()) {
    const inFunction = frameAt(source, index) !== undefined;
    const binary = (token.text === '+' || token.text === '*') && isBinary(source, index);
    const compound = token.text === '+=' || token.text === '*=';
    const sum =
      inFunction && (binary || compound)
        ? (compound ? assignedSum : simpleSum)(state, source, index)
        : undefined;
    if (sum !== undefined) {
      found.push({ line: token.line, ...sum });
    }
  }
  return found;
}
