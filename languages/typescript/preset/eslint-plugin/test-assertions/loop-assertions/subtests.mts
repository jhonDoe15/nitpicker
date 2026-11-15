import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  type SourceContext,
} from '../../rules/analysis/constant-resolution.mts';
import { callbackOf, isNestedTest, testCallback } from '../../test-quality/test-calls.mts';
import { inSet, propertyName, type FunctionNode } from '../unowned-async/nodes.mts';

type SubtestShaped = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };

const { DefinitionType } = TSESLint.Scope;

const SUBTEST_NAMES = new Set(['test', 'it']);

function isSubtestShaped(call: TSESTree.Node | undefined): call is SubtestShaped {
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    inSet(SUBTEST_NAMES, propertyName(call.callee))
  );
}

function isTestContext(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  const parameter = definition?.type === DefinitionType.Parameter ? definition : undefined;
  const fn = parameter?.node;
  return (
    isFunctionNode(fn) &&
    fn.params[0] === parameter?.name &&
    (isNestedTest(context, fn) || (isSubtestShaped(fn.parent) && callbackOf(fn.parent) === fn))
  );
}

export function subtestCallback(
  context: SourceContext,
  call: TSESTree.CallExpression,
): FunctionNode | undefined {
  const isSubtest =
    isSubtestShaped(call) &&
    call.callee.object.type === AST_NODE_TYPES.Identifier &&
    isTestContext(context, call.callee.object);
  return isSubtest ? callbackOf(call) : undefined;
}

export function testBody(
  context: SourceContext,
  call: TSESTree.CallExpression,
): FunctionNode | undefined {
  return testCallback(context, call) ?? subtestCallback(context, call);
}

export function isTestBoundary(context: SourceContext, node: TSESTree.Node): boolean {
  return (
    isNestedTest(context, node) ||
    (isFunctionNode(node) &&
      node.parent.type === AST_NODE_TYPES.CallExpression &&
      subtestCallback(context, node.parent) === node)
  );
}
