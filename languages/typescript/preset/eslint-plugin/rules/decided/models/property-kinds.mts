import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { foldTerm, term, withRange, type Term } from '../../analysis/logic/term-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { inside, rangeKey } from '../syntax.mts';

function isCallee(node: TSESTree.Node): boolean {
  return node.parent?.type === AST_NODE_TYPES.CallExpression && node.parent.callee === node;
}

function nameNode(tsNode: TypeScript.Node): TypeScript.Node {
  if (ts.isPropertyAccessExpression(tsNode)) {
    return tsNode.name;
  }
  return ts.isElementAccessExpression(tsNode) ? tsNode.argumentExpression : tsNode;
}

function isPlainProperty(
  node: TSESTree.MemberExpression,
  services: ParserServicesWithTypeInformation,
): boolean {
  const checker = services.program.getTypeChecker();
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  const symbol = checker.getSymbolAtLocation(nameNode(tsNode));
  return (
    symbol !== undefined &&
    (symbol.flags & ts.SymbolFlags.Property) !== 0 &&
    (symbol.flags & ts.SymbolFlags.Accessor) === 0
  );
}

function isReadOfProperty(node: TSESTree.Node): node is TSESTree.MemberExpression {
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const isNamed = !node.computed || node.property.type === AST_NODE_TYPES.Literal;
  return isNamed && !isCallee(node);
}

/** The member reads in `root` of a property that is not a plain data property by the type checker. */
export function unsteadyReads(
  root: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): TSESTree.MemberExpression[] {
  return [...inside(root)]
    .filter(isReadOfProperty)
    .filter((node) => !isPlainProperty(node, services));
}

/**
 * `built` with each member read of such a property a call of its own, which the solver takes as a
 * new value at every occurrence, because a getter or accessor may run code or change.
 */
export function withUnsteadyReads(built: Term, nodes: readonly TSESTree.Node[]): Term {
  const ranges = new Set(nodes.map((node) => rangeKey(node.range)));
  return foldTerm<Term>(built, (current, children) => {
    const rebuilt: Term = { ...current, children };
    const isUnsteady = current.kind === 'member' && ranges.has(rangeKey(current.range ?? [0, 0]));
    return isUnsteady ? withRange(term('call', undefined, [rebuilt]), current.range) : rebuilt;
  });
}
