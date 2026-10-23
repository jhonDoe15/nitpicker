import { concernOf } from './infrastructure-classes.mjs';
import { isAdapter, isDomain } from './domain-roles.mjs';

function byName(left, right) {
  return `${left.file}\0${left.name}`.localeCompare(`${right.file}\0${right.name}`);
}

function isHelper(entry) {
  return !isDomain(entry) && !isAdapter(entry);
}

function directHits(libraryEdges) {
  const hits = new Map();
  const sorted = libraryEdges.toSorted(
    (left, right) => byName(left.source, right.source) || left.library.localeCompare(right.library),
  );
  for (const { source, library } of sorted) {
    const concern = concernOf(library);
    if (isHelper(source) && concern?.reach === true && !hits.has(source)) {
      hits.set(source, { library, rule: concern.rule });
    }
  }
  return hits;
}

function importersOf(edges) {
  const importers = new Map();
  const helperEdges = edges.filter(({ source, target }) => isHelper(source) && isHelper(target));
  for (const { source, target } of helperEdges.toSorted((left, right) =>
    byName(left.source, right.source),
  )) {
    importers.set(target, [...(importers.get(target) ?? []), source]);
  }
  return importers;
}

export function reachableIo({ edges, libraryEdges }) {
  const hits = directHits(libraryEdges);
  const importers = importersOf(edges);
  const next = new Map([...hits.keys()].map((entry) => [entry, undefined]));
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

function pathFrom(entry, next) {
  const step = next.get(entry);
  return step === undefined ? [entry] : [entry, ...pathFrom(step, next)];
}

export function reachPath(entry, { hits, next }) {
  const path = pathFrom(entry, next);
  return { path, hit: hits.get(path.at(-1)) };
}
