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

function overlaps(left, right) {
  return [...left].some((name) => right.has(name));
}

function depends(earlier, later) {
  return (
    (!earlier.movable && !later.movable) ||
    overlaps(earlier.writes, later.reads) ||
    overlaps(earlier.writes, later.writes) ||
    overlaps(later.writes, earlier.reads)
  );
}

function describe(statement, index, { escaping, mode }) {
  const { reads, writes } = accessesOf(statement);
  return {
    statement,
    index,
    reads,
    writes,
    movable: movable(statement, escaping),
    key: keyOf(statement, mode),
    before: [],
  };
}

function precedes(left, right) {
  return (
    compareText(left.key, right.key) < 0 || (left.key === right.key && left.index < right.index)
  );
}

function linkDependencies(items) {
  for (const later of items) {
    later.before = items.slice(0, later.index).filter((earlier) => depends(earlier, later));
  }
}

function firstReady(items, placed) {
  const ready = items.filter(
    (item) => !placed.has(item) && item.before.every((earlier) => placed.has(earlier)),
  );
  return ready.reduce((best, item) => (precedes(item, best) ? item : best));
}

export function canonicalOrder(statements, context) {
  const items = statements.map((statement, index) => describe(statement, index, context));
  linkDependencies(items);
  const placed = items.reduce((done) => done.add(firstReady(items, done)), new Set());
  return [...placed].map((item) => item.statement);
}
