function isNested(outer, inner) {
  return inner.startsWith(`${outer}.`);
}

export function crossedCollections(joined) {
  const collections = [...joined].filter(([, many]) => many).map(([key]) => key);
  for (const [index, first] of collections.entries()) {
    const second = collections
      .slice(index + 1)
      .find((other) => !isNested(first, other) && !isNested(other, first));
    if (second !== undefined) {
      return { first, second };
    }
  }
  return undefined;
}
