import { rebuild } from '../../../near-duplicates/tree/nodes.mts';
import type { FlowNode } from '../typed/decided-types.mts';

export type Typer = (node: FlowNode) => FlowNode;

export function typedByKind(tree: FlowNode, typed: Readonly<Record<string, Typer>>): FlowNode {
  return rebuild(tree, (node: FlowNode, children: FlowNode[]): FlowNode => {
    const next = { ...node, children };
    return (Object.hasOwn(typed, node.kind) ? typed[node.kind]?.(next) : undefined) ?? next;
  });
}

export function tagOf(node: FlowNode): { bits: number; signed: boolean } | undefined {
  return node.bits === undefined ? undefined : { bits: node.bits, signed: node.signed === true };
}
