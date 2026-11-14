import { foldTerm, rangeKey, term, withRange } from '../../../../../../../shared/logic/terms.mjs';
import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { inside } from '../syntax.mjs';

function isCallee(node) {
  return node.parent?.type === 'CallExpression' && node.parent.callee === node;
}

function isPlainProperty(node, services) {
  const checker = services.program.getTypeChecker();
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  const symbol = checker.getSymbolAtLocation(tsNode.name ?? tsNode.argumentExpression ?? tsNode);
  return (
    symbol !== undefined &&
    (symbol.flags & ts.SymbolFlags.Property) !== 0 &&
    (symbol.flags & ts.SymbolFlags.Accessor) === 0
  );
}

function isReadOfProperty(node) {
  if (node.type !== 'MemberExpression') {
    return false;
  }
  const isNamed = !node.computed || node.property.type === 'Literal';
  return isNamed && !isCallee(node);
}

/** The member reads in `root` of a property that is not a plain data property by the type checker. */
export function unsteadyReads(root, services) {
  return [...inside(root)]
    .filter((node) => isReadOfProperty(node) && !isPlainProperty(node, services))
    .filter((node) => services.esTreeNodeToTSNodeMap.get(node) !== undefined);
}

/**
 * `built` with each member read of such a property a call of its own, which the solver takes as a
 * new value at every occurrence, because a getter or accessor may run code or change.
 */
export function withUnsteadyReads(built, nodes) {
  const ranges = new Set(nodes.map((node) => rangeKey(node.range)));
  return foldTerm(built, (current, children) => {
    const rebuilt = { ...current, children };
    const isUnsteady = current.kind === 'member' && ranges.has(rangeKey(current.range ?? [0, 0]));
    return isUnsteady ? withRange(term('call', undefined, [rebuilt]), current.range) : rebuilt;
  });
}
