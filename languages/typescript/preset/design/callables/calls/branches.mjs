import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';

function isConditional(node) {
  return ts.isIfStatement(node) || ts.isConditionalExpression(node);
}

function armOf(node) {
  const { parent } = node;
  if (ts.isIfStatement(parent)) {
    return [parent.thenStatement, parent.elseStatement].indexOf(node);
  }
  return ts.isConditionalExpression(parent)
    ? [parent.whenTrue, parent.whenFalse].indexOf(node)
    : -1;
}

export function branchesOf(scope, node) {
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
