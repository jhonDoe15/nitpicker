import { textOf } from '../../../../../shared/values/readers.mts';
import { foldTree as untypedFoldTree } from '../../../../../shared/traversal.mjs';
import type { ShapeNode } from '../../../../java/adapters/near-duplicates/jvm-types.mts';
import type { GoUnit } from '../types/go-types.mts';

type FoldSteps = {
  readonly expand: (node: ShapeNode) => readonly (readonly [ShapeNode, undefined])[];
  readonly combine: (node: ShapeNode, context: undefined, parts: readonly string[]) => string;
};

const foldTree: (root: ShapeNode, context: undefined, steps: FoldSteps) => string = untypedFoldTree;

function label(node: ShapeNode): string {
  const value = node.value === undefined ? '' : `:${node.value}`;
  const binding =
    node.binding === 'bound' && node.text !== node.value ? `=${textOf(node.value)}` : '';
  return `${node.kind}${value}${binding}`;
}

export function outline(root: ShapeNode): string {
  return foldTree(root, undefined, {
    expand: (node) => node.children.map((child) => [child, undefined] as const),
    combine: (node, _context, parts) =>
      parts.length === 0 ? label(node) : `${label(node)}(${parts.join(' ')})`,
  });
}

export function childAt(node: ShapeNode, index: number): ShapeNode {
  const child = node.children[index];
  if (child === undefined) {
    throw new TypeError(`node ${node.kind} has no child ${String(index)}`);
  }
  return child;
}

export function bodyOf(unit: GoUnit): ShapeNode {
  return childAt(unit.tree, 2);
}

export function statements(unit: GoUnit): string[] {
  return bodyOf(unit).children.map((statement) => outline(statement));
}
