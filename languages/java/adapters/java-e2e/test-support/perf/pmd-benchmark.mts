import { readFileSync } from 'node:fs';

const XPATH_RULE =
  /<rule name="(\w+)"[^>]*class="net\.sourceforge\.pmd\.lang\.rule\.xpath\.XPathRule"/gu;
const RULE_ROW = /^(\w+)\s+(\d+\.\d+)\s+\d+\.\d+\s+\d+\s+\d+\s*$/u;
const RULE_TOTAL = /^Total Rule\s+(\d+\.\d+)\s/u;

export type RuleTimes = {
  readonly seconds: ReadonlyMap<string, number>;
  readonly total: number;
};

export function xpathRuleNames(rulesetFiles: readonly string[]): Set<string> {
  return new Set(
    rulesetFiles.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(XPATH_RULE)].map((match) => match[1] ?? ''),
    ),
  );
}

export function parseRuleTimes(benchmark: string): RuleTimes {
  const seconds = new Map<string, number>();
  let total = 0;
  for (const line of benchmark.split('\n')) {
    const row = RULE_ROW.exec(line);
    if (row !== null) {
      seconds.set(row[1] ?? '', Number(row[2]));
    }
    const sum = RULE_TOTAL.exec(line);
    if (sum !== null) {
      total = Number(sum[1]);
    }
  }
  return { seconds, total };
}

export function largestShares(
  times: RuleTimes,
  names: ReadonlySet<string>,
): { rule: string; share: number }[] {
  return [...times.seconds]
    .filter(([rule]) => names.has(rule))
    .map(([rule, seconds]) => ({ rule, share: seconds / times.total }))
    .toSorted((left, right) => right.share - left.share);
}
