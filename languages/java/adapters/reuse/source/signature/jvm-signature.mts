import { annotationsEnd, textAt, topLevelIndexes } from '../jvm-members.mts';
import type { Token } from '../../jvm-reuse-types.mts';
import type { Range, Structure } from '../jvm-source-types.mts';

type Tokens = readonly Token[];

const ANGLE_DEPTH = new Map([
  ['<', 1],
  ['>', -1],
]);

function parameterRanges(tokens: Tokens, close: Int32Array, paren: number): Range[] {
  const ranges: Range[] = [];
  let from = paren + 1;
  let depth = 0;
  const closing = close[paren] ?? -1;
  for (const index of topLevelIndexes(close, { from: paren + 1, to: closing })) {
    depth += ANGLE_DEPTH.get(textAt(tokens, index)) ?? 0;
    if (textAt(tokens, index) === ',' && depth === 0) {
      ranges.push({ from, to: index });
      from = index + 1;
    }
  }
  return [...ranges, { from, to: closing }].filter((range) => range.to > range.from);
}

function javaParameterStart(tokens: Tokens, close: Int32Array, from: number): number {
  const positions = [from];
  for (const index of positions) {
    if (tokens[index]?.text === 'final') {
      positions.push(index + 1);
    } else if (tokens[index]?.text === '@') {
      positions.push(annotationsEnd(tokens, close, index));
    }
  }
  return positions.at(-1) ?? from;
}

function parameterType(
  tokens: Tokens,
  close: Int32Array,
  { range, kotlin }: { range: Range; kotlin: boolean },
): Token[] {
  const part = tokens.slice(range.from, range.to);
  if (!kotlin) {
    return tokens.slice(javaParameterStart(tokens, close, range.from), range.to - 1);
  }
  const colon = part.findIndex(({ text }) => text === ':');
  const assign = part.findIndex(({ text }) => text === '=');
  return part.slice(colon + 1, assign === -1 ? undefined : assign);
}

export function signature(
  structure: Structure,
  { paren }: { paren?: number | undefined },
  kotlin: boolean,
): string {
  const { tokens, close } = structure;
  if (paren === undefined || (close[paren] ?? -1) < 0) {
    return '';
  }
  return parameterRanges(tokens, close, paren)
    .map((range) =>
      parameterType(tokens, close, { range, kotlin })
        .map(({ text }) => text)
        .join(''),
    )
    .join(',');
}
