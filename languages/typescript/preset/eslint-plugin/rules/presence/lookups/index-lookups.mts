import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { TypedFacts } from '../../promises/cannot-reject.mts';
import { depthFirst, nameOf } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { syntaxChildren } from '../../decided/syntax.mts';
import { presenceRoot } from '../conditions.mts';
import { isAbsent } from '../in-guards.mts';

const OWNERSHIP_CALLS = new Set(['hasOwn', 'hasOwnProperty', 'has']);
const OPERATORS = new Set(['===', '!==']);

function checksKey(root: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(root, syntaxChildren)].some(
    (node) =>
      (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'in') ||
      (node.type === AST_NODE_TYPES.CallExpression &&
        OWNERSHIP_CALLS.has(
          nameOf(
            node.callee.type === AST_NODE_TYPES.MemberExpression
              ? node.callee.property
              : node.callee,
          ) ?? '',
        )),
  );
}

const MISSING_REPORT = /missing|required|not (?:provided|given|found|set)/iu;

function reportsMissing(scope: TypedFacts, root: TSESTree.Node): boolean {
  const { parent } = root;
  const taken =
    parent?.type === AST_NODE_TYPES.IfStatement && parent.test === root
      ? parent.consequent
      : undefined;
  const last = taken?.type === AST_NODE_TYPES.BlockStatement ? taken.body.at(-1) : taken;
  return (
    last?.type === AST_NODE_TYPES.ThrowStatement ||
    (last?.type === AST_NODE_TYPES.ReturnStatement &&
      last.argument !== null &&
      MISSING_REPORT.test(scope.sourceCode.getText(last.argument)))
  );
}

export function isUnknownIndexTest(scope: TypedFacts, node: TSESTree.BinaryExpression): boolean {
  const { left } = node;
  if (
    !OPERATORS.has(node.operator) ||
    !isAbsent(node.right) ||
    left.type !== AST_NODE_TYPES.MemberExpression ||
    !left.computed ||
    left.property.type === AST_NODE_TYPES.Literal
  ) {
    return false;
  }
  const { services } = scope;
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(left.object));
  const indexed = checker.getIndexInfoOfType(type, ts.IndexKind.String)?.type;
  const root = presenceRoot(node);
  return (
    indexed !== undefined &&
    (indexed.flags & ts.TypeFlags.Unknown) !== 0 &&
    root !== undefined &&
    !checksKey(root) &&
    !reportsMissing(scope, root)
  );
}
