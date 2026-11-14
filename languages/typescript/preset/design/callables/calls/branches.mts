import type { Node } from 'typescript';
import { ts, chainOf } from '../../syntax/typed.mts';
import type { Scope } from '../../design-types.mts';

function isConditional(node: Node): boolean {
  return ts.isIfStatement(node) || ts.isConditionalExpression(node);
}

function armOf(node: Node): number {
  const { parent } = node;
  if (ts.isIfStatement(parent)) {
    return [parent.thenStatement, parent.elseStatement].findIndex((arm) => arm === node);
  }
  return ts.isConditionalExpression(parent)
    ? [parent.whenTrue, parent.whenFalse].findIndex((arm) => arm === node)
    : -1;
}

export function branchesOf(scope: Scope, node: Node): string[] {
  const root = scope.site.node;
  const arms = chainOf(node, (current) => (current === root ? undefined : current.parent))
    .filter((current) => current !== root && armOf(current) !== -1)
    .toReversed();
  if (arms.length === 0) {
    return [];
  }
  const conditionals = scope.nodes.filter(isConditional);
  return arms.map(
    (arm) => `${String(conditionals.indexOf(arm.parent))}:${armOf(arm) === 0 ? 'then' : 'else'}`,
  );
}
