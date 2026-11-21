import { placed, present } from '../../../near-duplicates/tree/nodes.mts';
import type { FlowNode } from '../typed/decided-types.mts';

const JUMPS = new Map([
  ['return', 'returns'],
  ['throw', 'throws'],
  ['break', 'breaks'],
  ['continue', 'continues'],
]);

export function statementsOf(node: FlowNode | undefined): readonly FlowNode[] {
  if (node === undefined || node.kind === 'none') {
    return [];
  }
  return node.kind === 'block' ? node.children : [node];
}

export function exitOf(node: FlowNode | undefined): string | undefined {
  const pending: (FlowNode | undefined)[] = [node];
  for (const current of pending) {
    const last = statementsOf(current).at(-1);
    if (last?.kind === 'if' && present(last.children[2]).kind !== 'none') {
      pending.push(last.children[1], last.children[2]);
    } else if (last === undefined || !JUMPS.has(last.kind)) {
      return undefined;
    }
  }
  const last = present(statementsOf(node).at(-1));
  return JUMPS.get(last.kind) ?? 'leaves';
}

export function nodeText(node: FlowNode, subject = 'condition'): string {
  return node.text ?? `the ${subject} on line ${String(node.start)}`;
}

export function sourceOf(node: FlowNode): string {
  return node.text ?? node.value ?? '';
}

export function binaryOf(operator: string, left: FlowNode, right: FlowNode): FlowNode {
  return {
    ...placed(left.start, right.end ?? left.end),
    kind: 'binary',
    value: operator,
    children: [left, right],
    text: `${sourceOf(left)} ${operator} ${sourceOf(right)}`,
  };
}

export function valueEqualOf(left: FlowNode, right: FlowNode): FlowNode {
  return { ...binaryOf('==', left, right), equal: true };
}
