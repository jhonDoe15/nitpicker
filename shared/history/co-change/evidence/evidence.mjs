import { CO_CHANGE_EXAMPLES } from '../../../project-rules/hygiene-rules.mjs';

const EDIT_KINDS = new Set(['M', 'R', 'T']);
const ID_SPAN = 2 ** 21;

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

function editedModules({ commit, aliases, moduleOf }) {
  const modules = commit.entries
    .filter(editsExistingFile)
    .map(({ path }) => moduleOf(aliases.get(path) ?? path));
  return [...new Set(modules.filter((module) => module !== undefined))];
}

function moduleIds() {
  const ids = new Map();
  const names = [];
  return {
    names,
    idOf(name) {
      if (!ids.has(name)) {
        ids.set(name, names.length);
        names.push(name);
      }
      return ids.get(name);
    },
  };
}

function addPair(pairs, { first, second, sha }) {
  const key = first * ID_SPAN + second;
  const entry = pairs.get(key);
  if (entry === undefined) {
    pairs.set(key, { support: 1, examples: [sha] });
    return;
  }
  entry.support += 1;
  if (entry.examples.length < CO_CHANGE_EXAMPLES) {
    entry.examples.push(sha);
  }
}

function addCommitPairs(pairs, { sha, frequent }) {
  for (const [index, first] of frequent.entries()) {
    for (const second of frequent.slice(index + 1)) {
      addPair(pairs, { first, second, sha });
    }
  }
}

function countPairs({ touches, commitsOf, minSupport }) {
  const pairs = new Map();
  for (const { sha, modules } of touches) {
    const frequent = modules
      .filter((id) => commitsOf[id] >= minSupport)
      .toSorted((left, right) => left - right);
    addCommitPairs(pairs, { sha, frequent });
  }
  return pairs;
}

export function collectEvidence({ commits, moduleOf, settings }) {
  const aliases = new Map();
  const registry = moduleIds();
  const touches = [];
  const commitsOf = [];
  for (const commit of commits) {
    followRenames(aliases, commit.entries);
    const modules =
      commit.entries.length > settings.maxCommitFiles
        ? []
        : editedModules({ commit, aliases, moduleOf }).map((name) => registry.idOf(name));
    if (modules.length > 0) {
      touches.push({ sha: commit.sha, modules });
    }
    for (const id of modules) {
      commitsOf[id] = (commitsOf[id] ?? 0) + 1;
    }
  }
  return {
    used: touches.length,
    names: registry.names,
    commitsOf,
    pairs: countPairs({ touches, commitsOf, minSupport: settings.minSupport }),
  };
}

function areNested(first, second) {
  return second.startsWith(`${first}/`) || first.startsWith(`${second}/`);
}

function describePair({ key, entry }, { names, commitsOf }) {
  const [firstId, secondId] = [Math.floor(key / ID_SPAN), key % ID_SPAN].toSorted((left, right) =>
    names[left] < names[right] ? -1 : 1,
  );
  const firstCommits = commitsOf[firstId];
  const secondCommits = commitsOf[secondId];
  return {
    first: names[firstId],
    second: names[secondId],
    support: entry.support,
    examples: entry.examples,
    firstCommits,
    secondCommits,
    confidence: entry.support / Math.min(firstCommits, secondCommits),
  };
}

export function significantPairs(evidence, settings) {
  return [...evidence.pairs]
    .filter(([, entry]) => entry.support >= settings.minSupport)
    .map(([key, entry]) => describePair({ key, entry }, evidence))
    .filter(
      (pair) => pair.confidence >= settings.minConfidence && !areNested(pair.first, pair.second),
    )
    .toSorted(
      (left, right) =>
        left.first.localeCompare(right.first) || left.second.localeCompare(right.second),
    );
}
