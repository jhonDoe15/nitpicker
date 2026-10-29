const SAMPLED_FILES = 3;
const LISTED_FOLDERS = 10;
const LISTED_UNITS = 10;

function addTo(map, key, value) {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
}

function folderOf(file) {
  const index = file.lastIndexOf('/');
  return index < 0 ? '.' : file.slice(0, index);
}

function adjacencyOf(edges) {
  const adjacency = new Map();
  for (const { source, target } of edges) {
    addTo(adjacency, source, target);
    addTo(adjacency, target, source);
  }
  return adjacency;
}

function membersBy(modules, keyOf) {
  const members = new Map();
  for (const module of modules) {
    addTo(members, keyOf(module), module);
  }
  return members;
}

function remembered(compute) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      cache.set(key, compute(key));
    }
    return cache.get(key);
  };
}

function foldersOf(members, fileOf) {
  return [...new Set([...members].map((module) => folderOf(fileOf(module))))].sort();
}

function unitSummary(members, { label, fileOf }) {
  const files = [...members].map(fileOf).sort();
  return {
    unit: label,
    folders: foldersOf(members, fileOf).slice(0, LISTED_FOLDERS),
    files: files.slice(0, SAMPLED_FILES),
    count: files.length,
  };
}

function levelIndex(level, { context, adjacency }) {
  const keyOf = level === 'package' ? context.group : context.unitOf;
  const members = membersBy(context.modules, keyOf);
  const summary = remembered((key) => {
    const group = members.get(key) ?? new Set();
    const [first] = group;
    return unitSummary(group, { label: context.labelOf(level, first), fileOf: context.fileOf });
  });
  const neighbours = remembered((key) => {
    const found = new Map();
    for (const module of members.get(key) ?? []) {
      for (const other of adjacency.get(module) ?? []) {
        const unit = keyOf(other);
        found.set(unit, (found.get(unit) ?? 0) + 1);
      }
    }
    found.delete(key);
    return found;
  });
  const folders = remembered((key) => foldersOf(members.get(key) ?? new Set(), context.fileOf));
  const heaviestAround = remembered((key) => heaviest(neighbours(key)).map(([unit]) => unit));
  return { summary, neighbours, folders, heaviestAround };
}

function isHeavier([leftKey, left], [rightKey, right]) {
  return left > right || (left === right && leftKey < rightKey);
}

function heaviest(around) {
  const top = [];
  for (const entry of around) {
    if (top.length < LISTED_UNITS || isHeavier(entry, top.at(-1))) {
      const index = top.findIndex((listed) => isHeavier(entry, listed));
      top.splice(index < 0 ? top.length : index, 0, entry);
      top.length = Math.min(top.length, LISTED_UNITS);
    }
  }
  return top;
}

function listedUnits({ source, target }, index) {
  const [fromSource, fromTarget] = [source, target].map(index.neighbours);
  const candidates = new Set([
    target,
    ...index.heaviestAround(source),
    ...index.heaviestAround(target),
  ]);
  candidates.delete(source);
  const entries = [...candidates].map((key) => [
    key,
    key === target ? Infinity : (fromSource.get(key) ?? 0) + (fromTarget.get(key) ?? 0),
  ]);
  return heaviest(entries)
    .map(([key]) => index.summary(key))
    .sort((left, right) => left.unit.localeCompare(right.unit));
}

export function causeIndex(context, edges) {
  const adjacency = adjacencyOf(edges);
  const levels = new Map(
    ['package', 'unit'].map((level) => [level, levelIndex(level, { context, adjacency })]),
  );
  return ({ level, source, target }) => {
    const index = levels.get(level);
    return { folders: index.folders(source), units: listedUnits({ source, target }, index) };
  };
}
