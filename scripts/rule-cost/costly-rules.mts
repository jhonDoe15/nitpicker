export type RuleTime = { readonly rule: string; readonly ms: number };
export type RuleCost = RuleTime & { readonly timesMean: number; readonly costly: boolean };
type RulePass = {
  readonly rules?: Readonly<Record<string, { readonly total?: number }>> | undefined;
};
export type TimedResult = {
  readonly stats?:
    | { readonly times?: { readonly passes?: readonly RulePass[] | undefined } | undefined }
    | undefined;
};

const COSTLY_FACTOR = 15;

export function ruleTimes(results: readonly TimedResult[]): RuleTime[] {
  const totals = new Map<string, number>();
  for (const pass of results.flatMap((result) => result.stats?.times?.passes ?? [])) {
    for (const [rule, time] of Object.entries(pass.rules ?? {})) {
      totals.set(rule, (totals.get(rule) ?? 0) + (time.total ?? 0));
    }
  }
  return [...totals].map(([rule, ms]) => ({ rule, ms }));
}

/**
 * The rules by time, slowest first. A rule is costly when it takes `factor` times the mean of all
 * the rules or more.
 */
export function ruleCosts(times: readonly RuleTime[], factor = COSTLY_FACTOR): RuleCost[] {
  const mean = times.reduce((sum, { ms }) => sum + ms, 0) / Math.max(times.length, 1);
  return times
    .map(({ rule, ms }) => {
      const timesMean = mean > 0 ? ms / mean : 0;
      return { rule, ms, timesMean, costly: timesMean >= factor };
    })
    .toSorted((first, second) => second.ms - first.ms);
}

export function unexpectedCosts(
  costs: readonly RuleCost[],
  known: ReadonlySet<string>,
): RuleCost[] {
  return costs.filter(({ rule, costly }) => costly && !known.has(rule));
}
