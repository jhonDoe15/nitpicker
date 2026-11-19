import { between } from './source-file.mts';
import type { SourceFile, Span } from './sum-types.mts';

const COMPARISONS = new Set(['<', '>', '<=', '>=', '==', '!=']);

export function isComparison(text: string | undefined): boolean {
  return COMPARISONS.has(text ?? '');
}

const RANGES = new Set(['until', '..', '..<', 'downTo']);
const SINK_CALLS = new Set([
  'min',
  'max',
  'minOf',
  'maxOf',
  'get',
  'set',
  'subList',
  'substring',
  'charAt',
  'copyOf',
  'copyOfRange',
  'limit',
  'skip',
  'take',
  'drop',
  'repeat',
  'allocate',
  'ensureCapacity',
  'setLength',
  'sliceArray',
  'nCopies',
  'arrayOfNulls',
  'ArrayList',
  'StringBuilder',
  'ByteArray',
  'IntArray',
  'CharArray',
]);

export function usedAsBound(source: SourceFile, { from, to }: Span): boolean {
  const { tokens, opener } = source;
  const before = tokens[from - 1]?.text;
  const after = tokens[to]?.text;
  if ([before, after].some((text) => isComparison(text) || RANGES.has(text ?? ''))) {
    return true;
  }
  if (before === '[' && after === ']') {
    return true;
  }
  const open = opener[from] ?? -1;
  const argument = (before === '(' || before === ',') && (after === ')' || after === ',');
  return (
    argument &&
    open >= 0 &&
    tokens[open]?.text === '(' &&
    SINK_CALLS.has(tokens[open - 1]?.text ?? '')
  );
}

export function usedLater(
  source: SourceFile,
  { name, from, to }: { name: string; from: number; to: number },
): boolean {
  const { tokens } = source;
  return between(from, to).some((index) => {
    const member = tokens[index - 1]?.text === '.' && tokens[index - 2]?.text !== 'this';
    const assigned = tokens[index + 1]?.text === '=';
    return (
      tokens[index]?.text === name &&
      !member &&
      !assigned &&
      usedAsBound(source, { from: index, to: index + 1 })
    );
  });
}
