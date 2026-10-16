const MAX_COMPARED_CELLS = 1_000_000;

function sharedPrefixLength(left, right) {
  const differing = left.findIndex((token, index) => token !== right[index]);
  return differing === -1 ? left.length : differing;
}

function overlapLength(left, right) {
  const counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token) ?? 0) + 1);
  return right.filter((token) => {
    const remaining = counts.get(token) ?? 0;
    counts.set(token, remaining - 1);
    return remaining > 0;
  }).length;
}

function subsequenceLength(left, right) {
  const ids = new Map();
  const toIds = (tokens) =>
    Uint32Array.from(tokens, (token) => ids.get(token) ?? ids.set(token, ids.size).get(token));
  const rightIds = toIds(right);
  const columns = Array.from(rightIds.keys());
  const lengths = toIds(left).reduce(
    (previous, id) => {
      const next = new Uint32Array(rightIds.length + 1);
      for (const index of columns) {
        next[index + 1] =
          id === rightIds[index] ? previous[index] + 1 : Math.max(previous[index + 1], next[index]);
      }
      return next;
    },
    new Uint32Array(rightIds.length + 1),
  );
  return lengths[rightIds.length];
}

function sharedLength(left, right) {
  const prefix = sharedPrefixLength(left, right);
  const leftRest = left.slice(prefix);
  const rightRest = right.slice(prefix);
  const suffix = sharedPrefixLength(leftRest.toReversed(), rightRest.toReversed());
  const leftMiddle = leftRest.slice(0, leftRest.length - suffix);
  const rightMiddle = rightRest.slice(0, rightRest.length - suffix);
  if (leftMiddle.length * rightMiddle.length > MAX_COMPARED_CELLS) return undefined;
  return prefix + suffix + subsequenceLength(leftMiddle, rightMiddle);
}

export function tokenSimilarity(left, right, minimum) {
  const total = left.length + right.length;
  if (total === 0) return 0;
  if ((2 * Math.min(left.length, right.length)) / total < minimum) return 0;
  if ((2 * overlapLength(left, right)) / total < minimum) return 0;
  const shared = sharedLength(left, right);
  const similarity = shared === undefined ? 0 : (2 * shared) / total;
  return similarity >= minimum ? similarity : 0;
}
