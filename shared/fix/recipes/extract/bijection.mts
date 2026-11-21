import type {
  BindingState,
  HoleState,
  SiteState,
  TypeHole,
  TypePair,
  TypePairWalk,
} from './typed/extract-types.mts';

export function bindPair<Left, Right>(
  env: BindingState<Left, Right>,
  left: Left,
  right: Right,
): boolean {
  if (env.forward.has(left) || env.backward.has(right)) {
    return env.forward.get(left) === right && env.backward.get(right) === left;
  }
  env.forward.set(left, right);
  env.backward.set(right, left);
  return true;
}

export function recordTypeHole<Node>(
  holes: HoleState<Node>,
  [x, y]: TypePair<Node>,
  texts: readonly string[],
): void {
  const key = `type:${texts.join('\u0000')}`;
  const hole: TypeHole<Node> = holes.get(key) ?? { key, kind: 'type', occurrences: [] };
  hole.occurrences.push({ a: x, b: y });
  holes.set(key, hole);
}

function walkTypePairs<Node>(
  pair: TypePair<Node>,
  expand: TypePairWalk<Node>['expand'],
): string | undefined {
  const pending: TypePair<Node>[] = [pair];
  for (const current of pending) {
    const problem = expand(current, pending);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

export function typePairProblem<Node>(
  sites: SiteState,
  pair: TypePair<Node>,
  { textOf, expand }: TypePairWalk<Node>,
): string | undefined {
  const texts = pair.map((node) => textOf(node));
  if (texts[0] !== texts[1]) {
    sites.add(texts.join('\u0000'));
  }
  return walkTypePairs(pair, expand);
}
