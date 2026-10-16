function sharedPrefixLength(left, right) {
  const differing = left.findIndex((token, index) => token !== right[index]);
  return differing === -1 ? left.length : differing;
}

function subsequenceLength(left, right) {
  const lengths = left.reduce(
    (previous, token) => {
      const next = [0];
      for (const [index, other] of right.entries()) {
        next.push(
          token === other ? previous[index] + 1 : Math.max(previous[index + 1], next[index]),
        );
      }
      return next;
    },
    Array.from({ length: right.length + 1 }, () => 0),
  );
  return lengths[right.length];
}

function sharedLength(left, right) {
  const prefix = sharedPrefixLength(left, right);
  const leftRest = left.slice(prefix);
  const rightRest = right.slice(prefix);
  const suffix = sharedPrefixLength(leftRest.toReversed(), rightRest.toReversed());
  const middle = subsequenceLength(
    leftRest.slice(0, leftRest.length - suffix),
    rightRest.slice(0, rightRest.length - suffix),
  );
  return prefix + suffix + middle;
}

export function isNearCopy(left, right, minimum) {
  const total = left.length + right.length;
  if (2 * Math.min(left.length, right.length) < minimum * total) return false;
  const similarity = (2 * sharedLength(left, right)) / total;
  return similarity >= minimum && similarity < 1;
}
