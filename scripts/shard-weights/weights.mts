export type Analyzer = { readonly name: string; readonly dependencies?: readonly string[] };

export type Seconds = Readonly<Record<string, number>>;

const WEIGHT_SCALE = 100;
const WEIGHT_TOTAL = 200;
const HALF = 2;

export function median(values: readonly number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / HALF);
  const upper = sorted[middle] ?? Number.NaN;
  return sorted.length % HALF === 1 ? upper : ((sorted[middle - 1] ?? Number.NaN) + upper) / HALF;
}

function dependencyClosure(byName: ReadonlyMap<string, Analyzer>, name: string): Set<string> {
  const seen = new Set<string>();
  const pending = [name];
  for (const current of pending) {
    const fresh = (byName.get(current)?.dependencies ?? []).filter(
      (dependency) => !seen.has(dependency),
    );
    for (const dependency of fresh) {
      seen.add(dependency);
    }
    pending.push(...fresh);
  }
  return seen;
}

export function ownCosts(
  analyzers: readonly Analyzer[],
  secondsByName: Seconds,
): Record<string, number> {
  const byName = new Map(analyzers.map((analyzer) => [analyzer.name, analyzer]));
  return Object.fromEntries(
    analyzers.map(({ name }) => {
      const dependencySeconds = [...dependencyClosure(byName, name)].reduce(
        (sum, dependency) => sum + (secondsByName[dependency] ?? Number.NaN),
        0,
      );
      return [name, Math.max(0, (secondsByName[name] ?? Number.NaN) - dependencySeconds)];
    }),
  );
}

export function weightsFromSeconds(costs: Seconds): Record<string, number> {
  const heaviest = Math.max(...Object.values(costs));
  return Object.fromEntries(
    Object.entries(costs).map(([name, seconds]) => [
      name,
      Math.max(1, Math.round((seconds / heaviest) * WEIGHT_SCALE)),
    ]),
  );
}

export function blendReports(
  reports: readonly { readonly costs: Seconds }[],
): Record<string, number> {
  const shares = new Map<string, number[]>();
  for (const { costs } of reports) {
    const total = Object.values(costs).reduce((sum, seconds) => sum + seconds, 0);
    for (const [name, seconds] of Object.entries(costs)) {
      const values = shares.get(name) ?? [];
      values.push(seconds / total);
      shares.set(name, values);
    }
  }
  return Object.fromEntries(
    [...shares].map(([name, values]) => [
      name,
      Math.max(
        1,
        Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * WEIGHT_TOTAL),
      ),
    ]),
  );
}
