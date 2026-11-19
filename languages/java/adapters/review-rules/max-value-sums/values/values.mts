import { forward } from '../source-file.mts';
import type { CarrierState, Context, NumberKind, Ref, SourceFile, Span } from '../sum-types.mts';

const MAX_NAMES = new Map<string, NumberKind>([
  ['Integer.MAX_VALUE', 'int'],
  ['Int.MAX_VALUE', 'int'],
  ['Long.MAX_VALUE', 'long'],
]);
const INT_MAX = 2n ** 31n - 1n;
const LONG_MAX = 2n ** 63n - 1n;
const MEMBER = 'member';
const NOT_A_REFERENCE = new Set(['(', '[', '::', '++', '--']);

function literalKind(text: string): NumberKind | undefined {
  const digits = text.replaceAll('_', '').replace(/[lL]$/u, '');
  if (!/^(?:0[xX][\da-fA-F]+|\d+)$/u.test(digits)) {
    return undefined;
  }
  const value = BigInt(digits);
  if (value === INT_MAX) {
    return 'int';
  }
  return value === LONG_MAX ? 'long' : undefined;
}

export function accessorName(name: string): string {
  const stripped = /^(?:get|is)([A-Z].*)$/u.exec(name)?.[1];
  return stripped === undefined ? name : stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

function chainAt(tokens: SourceFile['tokens'], index: number): { parts: string[]; at: number } {
  const parts: string[] = [];
  const positions = [index];
  let at = index;
  for (const position of positions) {
    if (tokens[position]?.kind === 'identifier') {
      parts.push(tokens[position].text);
      at = position + 1;
      const chained =
        tokens[position + 1]?.text === '.' && tokens[position + 2]?.kind === 'identifier';
      positions.push(...(chained ? [position + 2] : []));
    }
  }
  return { parts, at };
}

function qualifierOf(parts: readonly string[]): string {
  if (parts.length === 1) {
    return 'none';
  }
  if (parts.length === 2 && parts[0] === 'this') {
    return 'this';
  }
  return parts.slice(0, -1).every((part) => /^[A-Z]/u.test(part)) ? 'type' : MEMBER;
}

export function refAt(source: SourceFile, index: number): Ref | undefined {
  const { tokens } = source;
  const { parts, at } = chainAt(tokens, index);
  const accessor = tokens[at]?.text === '(' && tokens[at + 1]?.text === ')';
  if (parts.length === 0 || (!accessor && NOT_A_REFERENCE.has(tokens[at]?.text ?? ''))) {
    return undefined;
  }
  return {
    name: accessor ? accessorName(parts.at(-1) ?? '') : (parts.at(-1) ?? ''),
    qualifier: accessor ? MEMBER : qualifierOf(parts),
    max: MAX_NAMES.get(parts.join('.')),
    start: index,
    end: at + (accessor ? 2 : 0),
  };
}

export function lookup(
  state: CarrierState,
  { source, frame }: Context,
  ref: Ref,
): NumberKind | undefined {
  if (ref.max !== undefined) {
    return ref.max;
  }
  if (ref.qualifier === MEMBER || ref.qualifier === 'type') {
    const paged = frame === undefined ? undefined : state.frames.get(frame)?.get(`.${ref.name}`);
    return paged ?? state.fields.get(ref.name);
  }
  const own = state.files.get(source.file)?.get(ref.name);
  if (ref.qualifier === 'this') {
    return own;
  }
  const local = frame === undefined ? undefined : state.frames.get(frame)?.get(ref.name);
  if (local !== undefined || frame?.params.some(({ name }) => name === ref.name)) {
    return local;
  }
  return own ?? (source.kotlin ? state.topLevel.get(ref.name) : undefined);
}

function plainKind(
  state: CarrierState,
  context: Context,
  { from, to }: Span,
): NumberKind | undefined {
  const { tokens } = context.source;
  const first = tokens[from];
  if (to - from === 1 && first?.kind === 'number') {
    return literalKind(first.text);
  }
  const ref = refAt(context.source, from);
  return ref !== undefined && ref.end === to ? lookup(state, context, ref) : undefined;
}

function branchesOf(source: SourceFile, { from, to }: Span): Span[] {
  let question = -1;
  let colon = -1;
  for (const { index } of forward(source, from)) {
    const text = source.tokens[index]?.text;
    if (index >= to) {
      break;
    }
    question = text === '?' && question === -1 ? index : question;
    colon = text === ':' && question !== -1 && colon === -1 ? index : colon;
  }
  return colon === -1
    ? []
    : [
        { from: question + 1, to: colon },
        { from: colon + 1, to },
      ];
}

export function valueKind(
  state: CarrierState,
  context: Context,
  span: Span,
): NumberKind | undefined {
  const branches = branchesOf(context.source, span);
  return (
    plainKind(state, context, span) ??
    branches.map((branch) => plainKind(state, context, branch)).find((kind) => kind !== undefined)
  );
}
