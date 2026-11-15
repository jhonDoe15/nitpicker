export function bindPair(env, left, right) {
  if (env.forward.has(left) || env.backward.has(right)) {
    return env.forward.get(left) === right && env.backward.get(right) === left;
  }
  env.forward.set(left, right);
  env.backward.set(right, left);
  return true;
}

export function recordTypeHole(holes, [x, y], texts) {
  const key = `type:${texts.join('\u0000')}`;
  const hole = holes.get(key) ?? { key, kind: 'type', occurrences: [] };
  hole.occurrences.push({ a: x, b: y });
  holes.set(key, hole);
}

function walkTypePairs(pair, expand) {
  const pending = [pair];
  for (const current of pending) {
    const problem = expand(current, pending);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

export function typePairProblem(sites, pair, { textOf, expand }) {
  const texts = pair.map((node) => textOf(node));
  if (texts[0] !== texts[1]) {
    sites.add(texts.join('\u0000'));
  }
  return walkTypePairs(pair, expand);
}
