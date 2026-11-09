import { compareText, keyOf } from '../tree/keys.mjs';
import { isBound } from '../tree/nodes.mjs';
import { accessesOf, isStable } from './effects.mjs';

function movable(statement, escaping) {
  if (statement.kind !== 'declare') {
    return false;
  }
  const [, name, value] = statement.children;
  return isBound(name) && !escaping.has(name.value) && isStable(value, escaping);
}

function describe(statement, index, escaping) {
  const { reads, writes } = accessesOf(statement);
  return { statement, index, reads, writes, movable: movable(statement, escaping) };
}

function listed(map, names) {
  return [...names].flatMap((name) => map.get(name) ?? []);
}

function remember(map, names, item) {
  for (const name of names) {
    if (!map.has(name)) {
      map.set(name, []);
    }
    map.get(name).push(item);
  }
}

function linkDependencies(items) {
  const writers = new Map();
  const readers = new Map();
  let fixed;
  for (const item of items) {
    const earlier = [
      ...(item.movable || fixed === undefined ? [] : [fixed]),
      ...listed(writers, item.reads),
      ...listed(writers, item.writes),
      ...listed(readers, item.writes),
    ];
    const distinct = new Set(earlier);
    item.waiting = distinct.size;
    for (const other of distinct) {
      other.after.push(item);
    }
    remember(writers, item.writes, item);
    remember(readers, item.reads, item);
    fixed = item.movable ? fixed : item;
  }
}

function ranked(items, mode) {
  const keys = items.map((item) => keyOf(item.statement, mode));
  const order = items.toSorted(
    (left, right) => compareText(keys[left.index], keys[right.index]) || left.index - right.index,
  );
  for (const [rank, item] of order.entries()) {
    item.rank = rank;
  }
}

function placeNext(ready) {
  const next = ready.reduce((best, item) => (item.rank < best.rank ? item : best));
  ready.splice(ready.indexOf(next), 1);
  for (const later of next.after) {
    later.waiting -= 1;
    if (later.waiting === 0) {
      ready.push(later);
    }
  }
  return next;
}

function placeAll(items) {
  const ready = items.filter((item) => item.waiting === 0);
  return items.map(() => placeNext(ready));
}

export function canonicalOrder(statements, { escaping, mode }) {
  if (statements.length < 2 || !statements.some((statement) => movable(statement, escaping))) {
    return statements;
  }
  const items = statements.map((statement, index) => ({
    ...describe(statement, index, escaping),
    after: [],
  }));
  linkDependencies(items);
  ranked(items, mode);
  return placeAll(items).map((item) => item.statement);
}
