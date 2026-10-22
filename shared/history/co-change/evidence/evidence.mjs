import { CO_CHANGE_EXAMPLES } from '../../../project-rules/hygiene-rules.mjs';

const EDIT_KINDS = new Set(['M', 'R', 'T']);

function followRenames(aliases, entries) {
  for (const entry of entries) {
    if (entry.kind === 'R') {
      aliases.set(entry.from, aliases.get(entry.path) ?? entry.path);
    }
  }
}

function editsExistingFile({ kind, exact }) {
  return EDIT_KINDS.has(kind) && !exact;
}

function isUsable(commit, settings) {
  return commit.entries.length <= settings.maxCommitFiles && commit.entries.some(editsExistingFile);
}

function modulesOf({ commit, aliases, moduleOf }) {
  const touched = commit.entries.filter((entry) => entry.kind === 'A' || editsExistingFile(entry));
  const modules = touched.map(({ path }) => moduleOf(aliases.get(path) ?? path));
  return [...new Set(modules.filter((module) => module !== undefined))].toSorted();
}

function pairsOf(modules) {
  return modules.flatMap((first, index) =>
    modules.slice(index + 1).map((second) => [first, second]),
  );
}

function record(evidence, { sha, modules }) {
  for (const module of modules) {
    evidence.commitsOf.set(module, (evidence.commitsOf.get(module) ?? 0) + 1);
  }
  for (const [first, second] of pairsOf(modules)) {
    const key = `${first}\0${second}`;
    const entry = evidence.pairs.get(key) ?? { first, second, support: 0, examples: [] };
    entry.support += 1;
    if (entry.examples.length < CO_CHANGE_EXAMPLES) {
      entry.examples.push(sha);
    }
    evidence.pairs.set(key, entry);
  }
}

export function collectEvidence({ commits, moduleOf, settings }) {
  const aliases = new Map();
  const evidence = { walked: commits.length, used: 0, commitsOf: new Map(), pairs: new Map() };
  for (const commit of commits) {
    followRenames(aliases, commit.entries);
    if (isUsable(commit, settings)) {
      evidence.used += 1;
      record(evidence, { sha: commit.sha, modules: modulesOf({ commit, aliases, moduleOf }) });
    }
  }
  return evidence;
}

export function significantPairs(evidence, settings) {
  return [...evidence.pairs.values()]
    .map((pair) => {
      const firstCommits = evidence.commitsOf.get(pair.first);
      const secondCommits = evidence.commitsOf.get(pair.second);
      return {
        ...pair,
        firstCommits,
        secondCommits,
        confidence: pair.support / Math.min(firstCommits, secondCommits),
      };
    })
    .filter(
      ({ support, confidence }) =>
        support >= settings.minSupport && confidence >= settings.minConfidence,
    )
    .toSorted(
      (left, right) =>
        left.first.localeCompare(right.first) || left.second.localeCompare(right.second),
    );
}
