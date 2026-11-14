import { isPure } from '../../near-duplicates/canonical/effects.mjs';
import { isBound, nodesOf } from '../../near-duplicates/tree/nodes.mjs';
import { branchKey, declaredNames } from './arm-keys.mjs';

const WRITES = new Set(['assign', 'update', 'declare']);
const MOVABLE_GROUPS = new Set(['if', 'when']);
const MAX_SHARED = 8;

function block(children) {
  return { kind: 'block', children };
}

function sharedCount(arms, pick) {
  const shortest = Math.min(MAX_SHARED, ...arms.map(({ statements }) => statements.length));
  const counts = Array.from({ length: shortest }, (_, index) => index + 1);
  const differs = counts.find((count) => {
    const keys = arms.map((arm) => branchKey(block(pick(arm.statements, count)), arm.scope));
    return keys.some((key) => key !== keys[0]);
  });
  return differs === undefined ? shortest : differs - 1;
}

function writtenNames(statements) {
  return new Set(
    statements
      .flatMap((statement) => nodesOf(statement))
      .filter((node) => WRITES.has(node.kind))
      .flatMap((node) => nodesOf(node.kind === 'declare' ? node.children[1] : node.children[0]))
      .filter((node) => node.kind === 'name')
      .map(({ value }) => value),
  );
}

function callsOut(statements) {
  return statements.some((statement) =>
    nodesOf(statement).some(
      (node) => node.kind === 'new' || (node.kind === 'call' && !isPure(node)),
    ),
  );
}

function headMovable(group, head, escaping) {
  const conditions = group.arms.flatMap((arm) => arm.conditions ?? arm.condition ?? []);
  const read = conditions
    .flatMap((condition) => nodesOf(condition))
    .filter(({ kind }) => kind === 'name');
  const written = writtenNames(head);
  const captured = callsOut(head) && read.some(({ value }) => escaping.has(value));
  return (
    conditions.every((condition) => isPure(condition)) &&
    read.every((name) => isBound(name) && !written.has(name.value)) &&
    !captured
  );
}

function tailMovable(arms, count) {
  return arms.every(({ statements }) => {
    const before = declaredNames(block(statements.slice(0, -count)));
    const tail = statements.slice(-count).flatMap((statement) => nodesOf(statement));
    return !tail.some((node) => node.kind === 'name' && before.has(node.value));
  });
}

function isMovableGroup(group) {
  return (
    MOVABLE_GROUPS.has(group.kind) &&
    group.complete &&
    group.isStatement &&
    group.arms.length > 1 &&
    group.arms.every(({ body }) => body.kind === 'block' && body.children.length > 0)
  );
}

/**
 * The statements every arm of a complete `if` chain or `when` in statement position starts or
 * ends with, when moving them before or after the branch keeps behaviour: `{ end, count }`.
 * `escaping` holds the names a lambda of the function captures.
 */
export function sharedEnds(group, escaping) {
  if (!isMovableGroup(group)) {
    return [];
  }
  const arms = group.arms.map(({ body }) => ({ statements: body.children, scope: body }));
  const head = sharedCount(arms, (statements, count) => statements.slice(0, count));
  const tail = sharedCount(arms, (statements, count) => statements.slice(-count));
  const ends = [];
  if (head > 0 && headMovable(group, arms[0].statements.slice(0, head), escaping)) {
    ends.push({ end: 'start', count: head });
  }
  if (tail > 0 && tailMovable(arms, tail)) {
    ends.push({ end: 'end', count: tail });
  }
  return ends;
}
