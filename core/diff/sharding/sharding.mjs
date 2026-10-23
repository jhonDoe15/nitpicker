import { withUsageLink } from '../../../shared/messages/troubleshooting.mjs';

export function planAnalyzerShards(analyzers, shardCount) {
  validateShardCount(shardCount);
  validateAnalyzers(analyzers);
  const components = dependencyComponents(analyzers);
  if (shardCount > components.length) {
    throw new RangeError(
      withUsageLink(
        `shardCount ${String(shardCount)} exceeds ${String(components.length)} independent analyzer components`,
      ),
    );
  }

  const shards = Array.from({ length: shardCount }, () => ({ analyzers: [], weight: 0 }));
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
      (left, right) => catalogOrder.get(left.name) - catalogOrder.get(right.name),
    ),
  );
}

export function selectAnalyzerShard(analyzers, shardCount, shardIndex) {
  const shards = planAnalyzerShards(analyzers, shardCount);
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
    throw new RangeError(
      withUsageLink(`shardIndex must be an integer between 0 and ${String(shardCount - 1)}`),
    );
  }
  return shards[shardIndex];
}

function validateShardCount(shardCount) {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new TypeError(withUsageLink('shardCount must be a positive integer'));
  }
}

function validateAnalyzers(analyzers) {
  if (!Array.isArray(analyzers) || analyzers.length === 0) {
    throw new TypeError('Analyzer catalog must be a non-empty array');
  }
  const analyzersByName = new Map();
  for (const analyzer of analyzers) {
    validateAnalyzerEntry(analyzer, analyzersByName);
    analyzersByName.set(analyzer.name, analyzer);
  }
  for (const analyzer of analyzers) {
    const missing = (analyzer.dependencies ?? []).find((name) => !analyzersByName.has(name));
    if (missing !== undefined)
      throw new Error(`Analyzer ${analyzer.name} requires unknown analyzer ${missing}`);
  }
  return analyzersByName;
}

function dependencyComponents(analyzers) {
  const neighbors = new Map(analyzers.map(({ name }) => [name, new Set()]));
  for (const analyzer of analyzers) {
    for (const dependencyName of analyzer.dependencies ?? []) {
      neighbors.get(analyzer.name).add(dependencyName);
      neighbors.get(dependencyName).add(analyzer.name);
    }
  }

  const visited = new Set();
  const components = [];
  for (const [index, analyzer] of analyzers.entries()) {
    if (visited.has(analyzer.name)) {
      continue;
    }
    const names = collectComponent(analyzer.name, neighbors, visited);
    const members = analyzers.filter(({ name }) => names.has(name));
    components.push({
      analyzers: members,
      weight: members.reduce((total, member) => total + (member.shardWeight ?? 1), 0),
      catalogIndex: index,
    });
  }
  return components;
}

function collectComponent(startName, neighbors, visited) {
  const component = new Set();
  const pending = [startName];
  for (const name of pending) {
    if (visited.has(name)) {
      continue;
    }
    visited.add(name);
    component.add(name);
    pending.push(...neighbors.get(name));
  }
  return component;
}

function compareComponents(left, right) {
  return right.weight - left.weight || left.catalogIndex - right.catalogIndex;
}

function validateAnalyzerEntry(analyzer, analyzersByName) {
  if (typeof analyzer?.name !== 'string' || analyzer.name.length === 0) {
    throw new TypeError('Analyzer name must be a non-empty string');
  }
  if (analyzersByName.has(analyzer.name)) {
    throw new Error(`Duplicate analyzer: ${analyzer.name}`);
  }
  const weight = analyzer.shardWeight ?? 1;
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new TypeError(`${analyzer.name} shardWeight must be a positive number`);
  }
  if (
    analyzer.dependencies !== undefined &&
    (!Array.isArray(analyzer.dependencies) ||
      analyzer.dependencies.some(
        (dependency) => typeof dependency !== 'string' || dependency.length === 0,
      ))
  ) {
    throw new TypeError(`${analyzer.name} dependencies must contain non-empty strings`);
  }
}
