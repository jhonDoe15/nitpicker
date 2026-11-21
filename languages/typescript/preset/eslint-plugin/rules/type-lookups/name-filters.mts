import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains } from '../analysis/ancestry.mts';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import {
  declaredName,
  isPresenceOnly,
  isWrapper,
  outermost,
  outermostFunction,
} from './lookup-sites.mts';
import { isKindTest, type TestScope } from './syntax-tests.mts';

const COLLECTION_READS = new Set(['has', 'get']);
const COLLECTION_WRITES = new Set(['add', 'set', 'delete', 'clear', 'push', 'splice']);
const NAME_PROPERTIES = new Set(['name', 'property']);
const SAFE_PARENTS = new Set<string>([
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.VariableDeclaration,
  AST_NODE_TYPES.ExpressionStatement,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.ReturnStatement,
]);

function isMappedNode(scope: TestScope, node: TSESTree.CallExpression): boolean {
  const [first] = node.arguments;
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.MemberExpression &&
    !callee.object.computed &&
    callee.object.property.type === AST_NODE_TYPES.Identifier &&
    callee.object.property.name === 'esTreeNodeToTSNodeMap' &&
    first !== undefined &&
    first.type !== AST_NODE_TYPES.SpreadElement &&
    isPlainWalkName(scope, first)
  );
}

function isWalkName(scope: TestScope, node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.CallExpression
    ? isMappedNode(scope, node)
    : isPlainWalkName(scope, node);
}

function isPlainWalkName(scope: TestScope, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === scope.walk.nodeName && scope.walk.selector === 'Identifier';
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === scope.walk.nodeName &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    NAME_PROPERTIES.has(node.property.name)
  );
}

function isWrittenInside(variable: TSESLint.Scope.Variable, region: TSESTree.Node): boolean {
  return variable.references.some((reference) => {
    const { identifier } = reference;
    if (!contains(region, identifier)) {
      return false;
    }
    if (reference.isWrite() && reference.init !== true) {
      return true;
    }
    const member = outermost(identifier).parent;
    const call = member?.parent;
    return (
      member?.type === AST_NODE_TYPES.MemberExpression &&
      !member.computed &&
      member.property.type === AST_NODE_TYPES.Identifier &&
      COLLECTION_WRITES.has(member.property.name) &&
      call?.type === AST_NODE_TYPES.CallExpression &&
      call.callee === member
    );
  });
}

function outerCollectionRead(scope: TestScope, use: TSESTree.Node): boolean {
  const argument = outermost(use);
  const call = argument.parent;
  if (
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.arguments[0] !== argument ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed ||
    call.callee.property.type !== AST_NODE_TYPES.Identifier ||
    !COLLECTION_READS.has(call.callee.property.name) ||
    call.callee.object.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const collection = call.callee.object;
  const variable = findVariable(scope.context, collection, collection.name);
  const definition = variable?.defs[0];
  if (
    variable === undefined ||
    definition === undefined ||
    contains(scope.walk.body, definition.name)
  ) {
    return false;
  }
  const region = outermostFunction(scope.walk.body) ?? scope.context.sourceCode.ast;
  return !isWrittenInside(variable, region);
}

function onlyFiltersByCollection(
  context: SourceContext,
  scope: TestScope,
  lookup: TSESTree.CallExpression,
): boolean {
  const declarator = declaredName(lookup);
  if (declarator === undefined) {
    return outerCollectionRead(scope, lookup);
  }
  const { id } = declarator;
  const variable =
    id.type === AST_NODE_TYPES.Identifier ? findVariable(context, id, id.name) : undefined;
  const uses = (variable?.references ?? []).filter((reference) => reference.isRead());
  return (
    declarator.parent.kind === 'const' &&
    uses.some((use) => outerCollectionRead(scope, use.identifier)) &&
    uses.every(
      (use) => outerCollectionRead(scope, use.identifier) || isPresenceOnly(use.identifier),
    )
  );
}

function earlierStatementIsKind(scope: TestScope, statement: TSESTree.Node): boolean {
  if (statement.type === AST_NODE_TYPES.IfStatement) {
    return isKindTest(scope, statement.test);
  }
  return (
    statement.type === AST_NODE_TYPES.VariableDeclaration ||
    statement.type === AST_NODE_TYPES.ExpressionStatement
  );
}

function stepIsKindOnly(scope: TestScope, current: TSESTree.Node, child: TSESTree.Node): boolean {
  if (current.type === AST_NODE_TYPES.IfStatement) {
    return current.test === child || isKindTest(scope, current.test);
  }
  if (current.type === AST_NODE_TYPES.BlockStatement) {
    const index = current.body.findIndex((statement) => statement === child);
    return current.body
      .slice(0, index)
      .every((statement) => earlierStatementIsKind(scope, statement));
  }
  if (current.type === AST_NODE_TYPES.LogicalExpression) {
    return current.operator === '&&' && (current.left === child || isKindTest(scope, current.left));
  }
  return isWrapper(current) || SAFE_PARENTS.has(current.type);
}

function onlyKindTestsBefore(scope: TestScope, lookup: TSESTree.Node): boolean {
  const path = [lookup, ...ancestorsOf(lookup)];
  const end = path.indexOf(scope.walk.body);
  const parents = path.slice(1, end + 1);
  return (
    end !== -1 &&
    parents.every((parent, index) => stepIsKindOnly(scope, parent, path[index] ?? parent))
  );
}

export function filtersByOuterCollection(
  context: SourceContext,
  scope: TestScope,
  lookup: TSESTree.CallExpression,
): boolean {
  const [argument] = lookup.arguments;
  return (
    argument !== undefined &&
    isWalkName(scope, argument) &&
    onlyFiltersByCollection(context, scope, lookup) &&
    onlyKindTestsBefore(scope, outermost(lookup))
  );
}
