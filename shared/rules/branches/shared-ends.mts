import { isPure } from '../../near-duplicates/canonical/effects.mts';
import { isBound, nodesOf, present } from '../../near-duplicates/tree/nodes.mts';
import { branchKey, declaredNames } from './arm-keys.mts';
import { smallest } from '../../lists/lists.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { BranchGroup } from './arm-types.mts';

type EndArm = { readonly statements: readonly TreeNode[]; readonly scope: TreeNode };

export type SharedEnd = { readonly end: 'start' | 'end'; readonly count: number };

const WRITES = new Set(['assign', 'update', 'declare']);
const MOVABLE_GROUPS = new Set(['if', 'when']);
const MAX_SHARED = 8;

function block(children: readonly TreeNode[]): TreeNode {
  return { kind: 'block', children };
}

function sharedCount(
  arms: readonly EndArm[],
  pick: (statements: readonly TreeNode[], count: number) => readonly TreeNode[],
): number {
  const shortest = smallest([MAX_SHARED, ...arms.map(({ statements }) => statements.length)]);
  const counts = Array.from({ length: shortest }, (_, index) => index + 1);
  const differs = counts.find((count) => {
    const keys = arms.map((arm) => branchKey(block(pick(arm.statements, count)), arm.scope));
    return keys.some((key) => key !== keys[0]);
  });
  return differs === undefined ? shortest : differs - 1;
}

function writtenNames(statements: readonly TreeNode[]): Set<string | undefined> {
  return new Set(
    statements
      .flatMap((statement) => nodesOf(statement))
      .filter((node) => WRITES.has(node.kind))
      .flatMap((node) =>
        nodesOf(present(node.kind === 'declare' ? node.children[1] : node.children[0])),
      )
      .filter((node) => node.kind === 'name')
      .map(({ value }) => value),
  );
}

function callsOut(statements: readonly TreeNode[]): boolean {
  return statements.some((statement) =>
    nodesOf(statement).some(
      (node) => node.kind === 'new' || (node.kind === 'call' && !isPure(node)),
    ),
  );
}

function headMovable(
  group: BranchGroup,
  head: readonly TreeNode[],
  escaping: ReadonlySet<string>,
): boolean {
  const conditions = group.arms.flatMap((arm) => arm.conditions ?? arm.condition ?? []);
  const read = conditions
    .flatMap((condition) => nodesOf(condition))
    .filter(({ kind }) => kind === 'name');
  const written = writtenNames(head);
  const captured =
    callsOut(head) && read.some(({ value }) => value !== undefined && escaping.has(value));
  return (
    conditions.every((condition) => isPure(condition)) &&
    read.every((name) => isBound(name) && !written.has(name.value)) &&
    !captured
  );
}

function tailMovable(arms: readonly EndArm[], count: number): boolean {
  return arms.every(({ statements }) => {
    const before = declaredNames(block(statements.slice(0, -count)));
    const tail = statements.slice(-count).flatMap((statement) => nodesOf(statement));
    return !tail.some(
      (node) => node.kind === 'name' && node.value !== undefined && before.has(node.value),
    );
  });
}

function isMovableGroup(group: BranchGroup): boolean {
  return (
    MOVABLE_GROUPS.has(group.kind) &&
    group.complete &&
    group.isStatement &&
    group.arms.length > 1 &&
    group.arms.every(({ body }) => body.kind === 'block' && body.children.length > 0)
  );
}

export function sharedEnds(group: BranchGroup, escaping: ReadonlySet<string>): SharedEnd[] {
  if (!isMovableGroup(group)) {
    return [];
  }
  const arms = group.arms.map(({ body }) => ({ statements: body.children, scope: body }));
  const head = sharedCount(arms, (statements, count) => statements.slice(0, count));
  const tail = sharedCount(arms, (statements, count) => statements.slice(-count));
  const ends: SharedEnd[] = [];
  const [firstArm] = arms;
  if (
    head > 0 &&
    firstArm !== undefined &&
    headMovable(group, firstArm.statements.slice(0, head), escaping)
  ) {
    ends.push({ end: 'start', count: head });
  }
  if (tail > 0 && tailMovable(arms, tail)) {
    ends.push({ end: 'end', count: tail });
  }
  return ends;
}
