import type { Call } from './calls.mts';
import type { Frame, SourceFile } from '../max-value-sums/sum-types.mts';

const BRANCHING = new Set([
  'if',
  'else',
  'switch',
  'when',
  'for',
  'while',
  'do',
  'try',
  'catch',
  'throw',
  '?',
  '?:',
  '&&',
  '||',
]);

export type Recursion = {
  readonly call: Call;
  readonly mutual: boolean;
};

function reachable(start: Frame, calls: readonly Call[]): Set<Frame> {
  const seen = new Set<Frame>([start]);
  for (const current of seen) {
    for (const { source, target } of calls) {
      if (source === current) {
        seen.add(target);
      }
    }
  }
  return seen;
}

function startsCycle({ source, target }: Call, calls: readonly Call[]): boolean {
  if (!reachable(target, calls).has(source)) {
    return false;
  }
  const members = [...reachable(source, calls)].filter((member) =>
    reachable(member, calls).has(source),
  );
  return members.every((member) => source.open <= member.open);
}

function unconditional(source: SourceFile, frame: Frame): boolean {
  return source.tokens
    .slice(frame.body.from, frame.body.to)
    .every(({ text }) => !BRANCHING.has(text));
}

export function recursionsOf(source: SourceFile, calls: readonly Call[]): Recursion[] {
  const reported = new Set<string>();
  return calls.flatMap((call): Recursion[] => {
    const { source: from, target } = call;
    const key = `${String(from.open)}:${String(target.open)}`;
    if (reported.has(key)) {
      return [];
    }
    if (from === target) {
      reported.add(key);
      return call.plain && unconditional(source, from) ? [] : [{ call, mutual: false }];
    }
    if (!startsCycle(call, calls)) {
      return [];
    }
    reported.add(key);
    return [{ call, mutual: true }];
  });
}
