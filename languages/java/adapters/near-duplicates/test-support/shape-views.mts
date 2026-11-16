import type { ShapeNode } from '../jvm-types.mts';
import type { NearFinding } from './engine-views.mts';

export function holes(finding: NearFinding): (string | undefined)[][] {
  return finding.parameters.map(({ kind, a, b }) => [kind, a.text ?? a.value, b.text ?? b.value]);
}

export function shapeNodesOf(tree: ShapeNode): ShapeNode[] {
  const pending = [tree];
  for (const node of pending) {
    pending.push(...node.children);
  }
  return pending;
}
