function isNested(outer: string, inner: string): boolean {
  return inner.startsWith(`${outer}.`);
}

export function crossedCollections(
  joined: ReadonlyMap<string, boolean>,
): { first: string; second: string } | undefined {
  const collections = [...joined].filter(([, many]) => many).map(([key]) => key);
  for (const [index, first] of collections.entries()) {
    const second = collections
      .slice(index + 1)
      .find((other) => !(isNested(first, other) || isNested(other, first)));
    if (second !== undefined) {
      return { first, second };
    }
  }
  return undefined;
}
