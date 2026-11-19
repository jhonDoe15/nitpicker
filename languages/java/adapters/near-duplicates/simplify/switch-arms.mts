import type { Node } from 'web-tree-sitter';
import { chainOf, depthFirst } from '../jvm-views.mts';

export type Arm = {
  readonly nodes: readonly Node[];
  readonly labels: readonly Node[];
  readonly body: string;
  readonly mergeable: boolean;
  readonly jumps: boolean;
};
export type Switch = {
  readonly kind: 'colon' | 'arrow' | 'when';
  readonly arms: readonly Arm[];
};

const JUMPS = new Set([
  'break_statement',
  'continue_statement',
  'return_statement',
  'throw_statement',
  'yield_statement',
]);
const UNMERGEABLE_LABELS = new Set(['pattern', 'guard', 'type_pattern', 'record_pattern']);

function isToken(node: Node): boolean {
  return node.childCount === 0 || node.type.includes('string') || node.type.includes('literal');
}

function tokensOf(nodes: readonly Node[]): string {
  const leaves = nodes.flatMap((node) =>
    [...depthFirst(node, (item: Node) => (isToken(item) ? [] : item.children))].filter(isToken),
  );
  return leaves.map(({ text }) => text).join(' ');
}

function lastInBlock(node: Node): Node | undefined {
  return node.type === 'block' ? (node.namedChildren.at(-1) ?? undefined) : undefined;
}

function isJump(node: Node | undefined): boolean {
  const last = node === undefined ? undefined : chainOf(node, lastInBlock).at(-1);
  return last !== undefined && JUMPS.has(last.type);
}

function isPlainLabel(label: Node): boolean {
  const parts = label.namedChildren;
  return (
    parts.length > 0 &&
    parts.every((part) => !UNMERGEABLE_LABELS.has(part.type) && part.type !== 'null_literal')
  );
}

function statementsOf(group: Node): Node[] {
  return group.namedChildren.filter((child) => child.type !== 'switch_label');
}

function labelsOf(group: Node): Node[] {
  return group.namedChildren.filter((child) => child.type === 'switch_label');
}

function colonArms(groups: readonly Node[]): Arm[] {
  const arms: Arm[] = [];
  let pending: Node[] = [];
  for (const group of groups) {
    pending.push(group);
    const statements = statementsOf(group);
    if (statements.length > 0) {
      const labels = pending.flatMap(labelsOf);
      arms.push({
        nodes: pending,
        labels,
        body: tokensOf(statements),
        mergeable:
          labels.every(isPlainLabel) &&
          !statements.some(({ type }) => type === 'local_variable_declaration'),
        jumps: isJump(statements.at(-1)),
      });
      pending = [];
    }
  }
  return arms;
}

function arrowArm(rule: Node): Arm {
  const labels = labelsOf(rule);
  const body = rule.namedChildren.filter((child) => child.type !== 'switch_label');
  return {
    nodes: [rule],
    labels,
    body: tokensOf(body),
    mergeable: labels.every(isPlainLabel),
    jumps: true,
  };
}

function whenArm(entry: Node): Arm {
  const arrow = entry.children.findIndex((child) => child.type === '->');
  const before = entry.children.slice(0, Math.max(arrow, 0));
  const conditions = before.filter((child) => child.isNamed);
  const isElse = before.some((child) => child.type === 'else');
  const body = entry.children.slice(arrow + 1);
  return {
    nodes: [entry],
    labels: conditions,
    body: tokensOf(body),
    mergeable:
      arrow > 0 &&
      !isElse &&
      conditions.length > 0 &&
      conditions.every((condition) => condition.type !== 'type_test'),
    jumps: true,
  };
}

export function switchOf(node: Node): Switch | undefined {
  if (node.type === 'switch_block') {
    const children = node.namedChildren;
    if (children.length > 0 && children.every(({ type }) => type === 'switch_rule')) {
      return { kind: 'arrow', arms: children.map(arrowArm) };
    }
    if (children.every(({ type }) => type === 'switch_block_statement_group')) {
      return { kind: 'colon', arms: colonArms(children) };
    }
    return undefined;
  }
  if (
    node.type === 'when_expression' &&
    node.namedChildren.some((child) => child.type === 'when_subject')
  ) {
    const entries = node.namedChildren.filter((child) => child.type === 'when_entry');
    return { kind: 'when', arms: entries.map(whenArm) };
  }
  return undefined;
}
