const MAX_COMPARED_TOKENS = 20_000;
const GUARD_SLOTS = 3;

export function createSimilarityCache() {
  return {
    vocabulary: new Map(),
    idsByTokens: new WeakMap(),
    profilesByIds: new WeakMap(),
  };
}

function idOf({ vocabulary }, token) {
  if (!vocabulary.has(token)) {
    vocabulary.set(token, vocabulary.size);
  }
  return vocabulary.get(token);
}

function idsOf(cache, tokens) {
  if (!cache.idsByTokens.has(tokens)) {
    cache.idsByTokens.set(
      tokens,
      Uint32Array.from(tokens, (token) => idOf(cache, token)),
    );
  }
  return cache.idsByTokens.get(tokens);
}

function profileOf({ profilesByIds }, ids) {
  if (!profilesByIds.has(ids)) {
    const counts = new Map();
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    profilesByIds.set(ids, counts);
  }
  return profilesByIds.get(ids);
}

function overlapLength(cache, left, right) {
  const [small, large] = [profileOf(cache, left), profileOf(cache, right)].toSorted(
    (a, b) => a.size - b.size,
  );
  return [...small].reduce(
    (shared, [id, count]) => shared + Math.min(count, large.get(id) ?? 0),
    0,
  );
}

function sharedPrefixLength(left, right) {
  const differing = left.findIndex((id, index) => id !== right[index]);
  return differing === -1 ? left.length : differing;
}

function matchLength(left, right, { x, y }) {
  if (x >= left.length || y >= right.length || left[x] !== right[y]) {
    return 0;
  }
  const rest = Math.min(left.length - x, right.length - y);
  const mismatch = left.subarray(x, x + rest).findIndex((id, offset) => id !== right[y + offset]);
  return mismatch === -1 ? rest : mismatch;
}

function extendPath({ left, right, furthest, limit }, edits, diagonal) {
  const slot = limit + 1 + diagonal;
  const down =
    diagonal === -edits || (diagonal !== edits && furthest[slot - 1] < furthest[slot + 1]);
  const start = down ? furthest[slot + 1] : furthest[slot - 1] + 1;
  const end = start + matchLength(left, right, { x: start, y: start - diagonal });
  furthest[slot] = end;
  return end >= left.length && end - diagonal >= right.length;
}

function editDistance(left, right, limit) {
  const search = { left, right, limit, furthest: new Int32Array(2 * limit + GUARD_SLOTS) };
  const steps = Uint32Array.from({ length: limit + 1 }, (_, index) => index);
  return steps.find((edits) =>
    steps.subarray(0, edits + 1).some((step) => extendPath(search, edits, 2 * step - edits)),
  );
}

function middleDistance(left, right, limit) {
  const prefix = sharedPrefixLength(left, right);
  const leftRest = left.subarray(prefix);
  const rightRest = right.subarray(prefix);
  const suffix = sharedPrefixLength(leftRest.toReversed(), rightRest.toReversed());
  const leftMiddle = leftRest.subarray(0, leftRest.length - suffix);
  const rightMiddle = rightRest.subarray(0, rightRest.length - suffix);
  if (leftMiddle.length + rightMiddle.length > MAX_COMPARED_TOKENS) {
    return undefined;
  }
  return editDistance(
    leftMiddle,
    rightMiddle,
    Math.min(limit, leftMiddle.length + rightMiddle.length),
  );
}

export function tokenSimilarity(cache, { left, right }, minimum) {
  const total = left.length + right.length;
  if (total === 0) {
    return 0;
  }
  if ((2 * Math.min(left.length, right.length)) / total < minimum) {
    return 0;
  }
  const [leftIds, rightIds] = [idsOf(cache, left), idsOf(cache, right)];
  if ((2 * overlapLength(cache, leftIds, rightIds)) / total < minimum) {
    return 0;
  }
  const distance = middleDistance(leftIds, rightIds, Math.ceil((1 - minimum) * total));
  const similarity = distance === undefined ? 0 : (total - distance) / total;
  return similarity >= minimum ? similarity : 0;
}
