export function followedChain<Step>(
  start: Step,
  next: (current: Step) => Step | undefined,
  maxLength: number,
): Step[] {
  const chain = [start];
  for (const current of chain) {
    const following = chain.length < maxLength ? next(current) : undefined;
    if (following !== undefined) {
      chain.push(following);
    }
  }
  return chain;
}
