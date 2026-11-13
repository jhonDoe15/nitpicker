import type { Analyzer } from '../../../shared/values/analyzers.mts';
import { fieldOf, numberOr, textsOf } from '../../../shared/values/readers.mts';

type Shard<T> = { readonly analyzers: T[]; weight: number };

type Component<T> = {
  readonly analyzers: T[];
  readonly weight: number;
  readonly catalogIndex: number;
};

export function planAnalyzerShards<T extends Analyzer>(
  analyzers: readonly T[],
  shardCount: number,
): T[][] {
  validateShardCount(shardCount);
  validateAnalyzers(analyzers);
  const components = dependencyComponents(analyzers);
  if (shardCount > components.length) {
    throw new RangeError(
      `shardCount ${String(shardCount)} exceeds ${String(components.length)} independent analyzer components`,
    );
  }

  const shards = Array.from({ length: shardCount }, (): Shard<T> => ({ analyzers: [], weight: 0 }));
  for (const component of components.sort(compareComponents)) {
    const shard = shards.reduce((lightest, candidate) =>
      candidate.weight < lightest.weight ? candidate : lightest,
    );
    shard.analyzers.push(...component.analyzers);
    shard.weight += component.weight;
  }

  const catalogOrder = new Map(analyzers.map(({ name }, index) => [name, index]));
  return shards.map(({ analyzers: shardAnalyzers }) =>
    shardAnalyzers.sort(
      (left, right) => (catalogOrder.get(left.name) ?? 0) - (catalogOrder.get(right.name) ?? 0),
    ),
  );
}

export function selectAnalyzerShard<T extends Analyzer>(
  analyzers: readonly T[],
  shardCount: number,
  shardIndex: number,
): T[] {
  const shards = planAnalyzerShards(analyzers, shardCount);
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
    throw new RangeError(`shardIndex must be an integer between 0 and ${String(shardCount - 1)}`);
  }
  return shards[shardIndex] ?? [];
}

function validateShardCount(shardCount: number): void {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new TypeError('shardCount must be a positive integer');
  }
}

function validateAnalyzers(analyzers: readonly unknown[]): void {
  if (!Array.isArray(analyzers) || analyzers.length === 0) {
    throw new TypeError('Analyzer catalog must be a non-empty array');
  }
  const names = new Set<string>();
  for (const analyzer of analyzers) {
    names.add(validateAnalyzerEntry(analyzer, names));
  }
  for (const analyzer of analyzers) {
    const missing = namesOf(analyzer, 'dependencies').find((name) => !names.has(name));
    if (missing !== undefined) {
      throw new Error(
        `Analyzer ${String(fieldOf(analyzer, 'name'))} requires unknown analyzer ${missing}`,
      );
    }
  }
}

function namesOf(analyzer: unknown, key: string): string[] {
  return textsOf(fieldOf(analyzer, key));
}

function isNameList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isName);
}

function isName(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function dependencyComponents<T extends Analyzer>(analyzers: readonly T[]): Component<T>[] {
  const neighbors = new Map(analyzers.map(({ name }) => [name, new Set<string>()]));
  for (const analyzer of analyzers) {
    const companions = namesOf(analyzer, 'colocatedWith').filter((name) => neighbors.has(name));
    for (const dependencyName of [...namesOf(analyzer, 'dependencies'), ...companions]) {
      neighbors.get(analyzer.name)?.add(dependencyName);
      neighbors.get(dependencyName)?.add(analyzer.name);
    }
  }

  const visited = new Set<string>();
  const components: Component<T>[] = [];
  for (const [index, analyzer] of analyzers.entries()) {
    if (visited.has(analyzer.name)) {
      continue;
    }
    const names = collectComponent(analyzer.name, neighbors, visited);
    const members = analyzers.filter(({ name }) => names.has(name));
    components.push({
      analyzers: members,
      weight: members.reduce((total, member) => total + numberOr(member['shardWeight'], 1), 0),
      catalogIndex: index,
    });
  }
  return components;
}

function collectComponent(
  startName: string,
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
  visited: Set<string>,
): Set<string> {
  const component = new Set<string>();
  const pending = [startName];
  for (const name of pending) {
    if (visited.has(name)) {
      continue;
    }
    visited.add(name);
    component.add(name);
    pending.push(...(neighbors.get(name) ?? []));
  }
  return component;
}

function compareComponents(left: Component<unknown>, right: Component<unknown>): number {
  return right.weight - left.weight || left.catalogIndex - right.catalogIndex;
}

function validateAnalyzerEntry(analyzer: unknown, names: ReadonlySet<string>): string {
  const name = fieldOf(analyzer, 'name');
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('Analyzer name must be a non-empty string');
  }
  if (names.has(name)) {
    throw new Error(`Duplicate analyzer: ${name}`);
  }
  const weight = fieldOf(analyzer, 'shardWeight') ?? 1;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    throw new TypeError(`${name} shardWeight must be a positive number`);
  }
  const dependencies = fieldOf(analyzer, 'dependencies');
  if (dependencies !== undefined && !isNameList(dependencies)) {
    throw new TypeError(`${name} dependencies must contain non-empty strings`);
  }
  const colocatedWith = fieldOf(analyzer, 'colocatedWith');
  if (colocatedWith !== undefined && !isNameList(colocatedWith)) {
    throw new TypeError(`${name} colocatedWith must contain non-empty strings`);
  }
  return name;
}
