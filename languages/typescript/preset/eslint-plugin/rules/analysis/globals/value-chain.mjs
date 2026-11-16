export function followedChain(start, next, maxLength) {
  const chain = [start];
  for (const current of chain) {
    const following = chain.length < maxLength ? next(current) : undefined;
    if (following !== undefined) {
      chain.push(following);
    }
  }
  return chain;
}
