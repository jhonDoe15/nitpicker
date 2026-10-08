export type TallyResult =
  { readonly kind: 'counted'; readonly count: number } | { readonly kind: 'invalid-input' };

export function tally(input: unknown): TallyResult {
  if (!Array.isArray(input)) {
    return { kind: 'invalid-input' };
  }
  const count = input.filter(
    (item: unknown) => typeof item === 'string' && item.trim().length > 0,
  ).length;
  return { kind: 'counted', count };
}

export function describeTally(result: TallyResult): string {
  switch (result.kind) {
    case 'counted':
      return `Counted ${String(result.count)}`;
    case 'invalid-input':
      return 'Invalid input';
  }
}
