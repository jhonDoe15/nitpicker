import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import {
  ancestorsOf,
  nodeChildren,
  nodesWithoutNested,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { calleeIdentifierOrMember } from '../support/process-command-helpers.mts';

type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

const LOOP_NODE_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);
const REPEATED_METHODS = new Set(['map', 'forEach', 'flatMap']);
const POOL_CALL_NAME = /(?:pool|pmap|maplimit|mapseries|eachlimit|parallel|concurrent)/iu;
const NESTED_CLASS_TYPES = new Set<string>([
  AST_NODE_TYPES.ClassDeclaration,
  AST_NODE_TYPES.ClassExpression,
]);

function isRepeatedCall(call: TSESTree.CallExpression): boolean {
  const name = calleeIdentifierOrMember(call);
  if (name === undefined) {
    return false;
  }
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.MemberExpression && REPEATED_METHODS.has(name)) {
    return true;
  }
  return POOL_CALL_NAME.test(name);
}

function isArgumentOfRepeatedCall(node: TSESTree.Node): boolean {
  const parent = node.parent;
  return (
    parent?.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.includes(node as TSESTree.CallExpressionArgument) &&
    isRepeatedCall(parent)
  );
}

function classMethodReferences(
  classBody: TSESTree.ClassBody,
  methodName: string,
): TSESTree.MemberExpression[] {
  return nodesWithoutNested(classBody, NESTED_CLASS_TYPES, nodeChildren).filter(
    (node): node is TSESTree.MemberExpression =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.ThisExpression &&
      memberName(node) === methodName,
  );
}

function identifierRefs(sourceCode: SourceCode, identifier: TSESTree.Identifier): TSESTree.Node[] {
  return (variableNamed(sourceCode, identifier)?.references ?? [])
    .filter((ref) => !ref.init)
    .map((ref) => ref.identifier);
}

function enclosingFunctionRefs(sourceCode: SourceCode, fn: FunctionNode): TSESTree.Node[] {
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration && fn.id !== null) {
    return identifierRefs(sourceCode, fn.id);
  }
  const parent = fn.parent;
  if (
    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
  ) {
    return identifierRefs(sourceCode, parent.id);
  }
  if (
    parent?.type === AST_NODE_TYPES.MethodDefinition &&
    !parent.computed &&
    parent.key.type === AST_NODE_TYPES.Identifier &&
    parent.parent.type === AST_NODE_TYPES.ClassBody
  ) {
    return classMethodReferences(parent.parent, parent.key.name);
  }
  return [];
}

function isReferenceRepeated(
  sourceCode: SourceCode,
  ref: TSESTree.Node,
  visited: Set<TSESTree.Node>,
): boolean {
  if (isArgumentOfRepeatedCall(ref)) {
    return true;
  }
  const parent = ref.parent;
  if (parent?.type === AST_NODE_TYPES.CallExpression && parent.callee === ref) {
    return isNodeInRepeatedContext(sourceCode, parent, visited);
  }
  return false;
}

function isNodeInRepeatedContext(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  visited: Set<TSESTree.Node>,
): boolean {
  if (visited.has(node)) {
    return false;
  }
  visited.add(node);
  for (const ancestor of ancestorsOf(node)) {
    if (LOOP_NODE_TYPES.has(ancestor.type)) {
      return true;
    }
    if (isFunctionNode(ancestor)) {
      return (
        isArgumentOfRepeatedCall(ancestor) ||
        enclosingFunctionRefs(sourceCode, ancestor).some((ref) =>
          isReferenceRepeated(sourceCode, ref, visited),
        )
      );
    }
  }
  return false;
}

export function isInRepeatedContext(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): boolean {
  return isNodeInRepeatedContext(sourceCode, call, new Set());
}
