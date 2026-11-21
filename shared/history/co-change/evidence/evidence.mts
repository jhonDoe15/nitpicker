import { CO_CHANGE_EXAMPLES } from '../../../project-rules/hygiene-rules.mts';
import type {
  CoChangeSettings,
  CollectedEvidence,
  EvidencePair,
  HistoryCommit,
  HistoryEntry,
  ModuleOf,
  PairEntry,
} from '../../typed/history-types.mts';

type Aliases = Map<string, string>;
type Pairs = Map<number, PairEntry>;
type Touch = { readonly sha: string; readonly modules: number[] };

const EDIT_KINDS = new Set(['M', 'R', 'T']);
const ID_SPAN = 2 ** 21;

function followRenames(aliases: Aliases, entries: readonly HistoryEntry[]): void {
  for (const entry of entries) {
    if (entry.kind === 'R' && entry.from !== undefined) {
      aliases.set(entry.from, aliases.get(entry.path) ?? entry.path);
    }
  }
}

function editsExistingFile({ kind, exact }: HistoryEntry): boolean {
  return EDIT_KINDS.has(kind) && !exact;
}

function editedModules({
  commit,
  aliases,
  moduleOf,
}: {
  readonly commit: HistoryCommit;
  readonly aliases: Aliases;
  readonly moduleOf: ModuleOf;
}): string[] {
  const modules = commit.entries
    .filter(editsExistingFile)
    .map(({ path }) => moduleOf(aliases.get(path) ?? path));
  return [...new Set(modules.filter((module) => module !== undefined))];
}

function moduleIds(): { names: string[]; idOf: (name: string) => number } {
  const ids = new Map<string, number>();
  const names: string[] = [];
  return {
    names,
    idOf(name) {
      const known = ids.get(name);
      if (known !== undefined) {
        return known;
      }
      ids.set(name, names.length);
      names.push(name);
      return names.length - 1;
    },
  };
}

function addPair(
  pairs: Pairs,
  { first, second, sha }: { readonly first: number; readonly second: number; readonly sha: string },
): void {
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

function addCommitPairs(
  pairs: Pairs,
  { sha, frequent }: { readonly sha: string; readonly frequent: readonly number[] },
): void {
  for (const [index, first] of frequent.entries()) {
    for (const second of frequent.slice(index + 1)) {
      addPair(pairs, { first, second, sha });
    }
  }
}

function countPairs({
  touches,
  commitsOf,
  minSupport,
}: {
  readonly touches: readonly Touch[];
  readonly commitsOf: readonly number[];
  readonly minSupport: number;
}): Pairs {
  const pairs: Pairs = new Map();
  for (const { sha, modules } of touches) {
    const frequent = modules
      .filter((id) => (commitsOf[id] ?? Number.NaN) >= minSupport)
      .toSorted((left, right) => left - right);
    addCommitPairs(pairs, { sha, frequent });
  }
  return pairs;
}

export function collectEvidence({
  commits,
  moduleOf,
  settings,
}: {
  readonly commits: readonly HistoryCommit[];
  readonly moduleOf: ModuleOf;
  readonly settings: CoChangeSettings;
}): CollectedEvidence {
  const aliases: Aliases = new Map();
  const registry = moduleIds();
  const touches: Touch[] = [];
  const commitsOf: number[] = [];
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

function compareNames(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function areNested(first: string, second: string): boolean {
  return second.startsWith(`${first}/`) || first.startsWith(`${second}/`);
}

function describePair(
  { key, entry }: { readonly key: number; readonly entry: PairEntry },
  { names, commitsOf }: CollectedEvidence,
): EvidencePair {
  const [firstId = 0, secondId = 0] = [Math.floor(key / ID_SPAN), key % ID_SPAN].toSorted(
    (left, right) => compareNames(names[left] ?? '', names[right] ?? ''),
  );
  const firstCommits = commitsOf[firstId] ?? 0;
  const secondCommits = commitsOf[secondId] ?? 0;
  return {
    first: names[firstId] ?? '',
    second: names[secondId] ?? '',
    support: entry.support,
    examples: entry.examples,
    firstCommits,
    secondCommits,
    confidence: entry.support / Math.min(firstCommits, secondCommits),
  };
}

export function significantPairs(
  evidence: CollectedEvidence,
  settings: CoChangeSettings,
): EvidencePair[] {
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
