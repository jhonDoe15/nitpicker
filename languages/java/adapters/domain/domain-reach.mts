import { concernOf } from './infrastructure-classes.mts';
import { isAdapter, isDomain } from './domain-roles.mts';
import type { ClassEdge, ClassEntry, LibraryEdge, LibraryHit, Reach } from './domain-types.mts';

function byName(left: ClassEntry, right: ClassEntry): number {
  return `${left.file}\0${left.name}`.localeCompare(`${right.file}\0${right.name}`);
}

function isHelper(entry: ClassEntry): boolean {
  return !(isDomain(entry) || isAdapter(entry));
}

function directHits(libraryEdges: readonly LibraryEdge[]): Reach['hits'] {
  const hits = new Map<ClassEntry, LibraryHit>();
  const sorted = libraryEdges.toSorted((left, right) => {
    const order = byName(left.source, right.source);
    return order === 0 ? left.library.localeCompare(right.library) : order;
  });
  for (const { source, library } of sorted) {
    const concern = concernOf(library);
    if (isHelper(source) && concern?.reach === true && !hits.has(source)) {
      hits.set(source, { library, rule: concern.rule });
    }
  }
  return hits;
}

function importersOf(edges: readonly ClassEdge[]): Map<ClassEntry, ClassEntry[]> {
  const importers = new Map<ClassEntry, ClassEntry[]>();
  const helperEdges = edges.filter(({ source, target }) => isHelper(source) && isHelper(target));
  for (const { source, target } of helperEdges.toSorted((left, right) =>
    byName(left.source, right.source),
  )) {
    importers.set(target, [...(importers.get(target) ?? []), source]);
  }
  return importers;
}

export function reachableIo({
  edges,
  libraryEdges,
}: {
  edges: readonly ClassEdge[];
  libraryEdges: readonly LibraryEdge[];
}): Reach {
  const hits = directHits(libraryEdges);
  const importers = importersOf(edges);
  const next = new Map<ClassEntry, ClassEntry | undefined>(
    [...hits.keys()].map((entry) => [entry, undefined]),
  );
  const queue = [...hits.keys()].toSorted(byName);
  for (const reached of queue) {
    const fresh = (importers.get(reached) ?? []).filter((importer) => !next.has(importer));
    for (const importer of fresh) {
      next.set(importer, reached);
    }
    queue.push(...fresh);
  }
  return { hits, next };
}

function pathFrom(entry: ClassEntry, next: Reach['next']): ClassEntry[] {
  const path = [entry];
  for (const step of path) {
    const following = next.get(step);
    path.push(...(following === undefined ? [] : [following]));
  }
  return path;
}

export function reachPath(
  entry: ClassEntry,
  { hits, next }: Reach,
): { path: ClassEntry[]; hit: LibraryHit } {
  const path = pathFrom(entry, next);
  const hit = hits.get(path.at(-1) ?? entry);
  if (hit === undefined) {
    throw new Error(`No library hit for ${entry.name}`);
  }
  return { path, hit };
}
