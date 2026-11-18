import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { toTerm } from '../../../eslint-plugin/rules/analysis/logic/estree-terms.mts';
import { isSideEffectFree } from '../../../eslint-plugin/rules/analysis/logic/term-views.mts';
import { outsideFunctions } from '../../../eslint-plugin/rules/decided/syntax.mts';
import {
  keptFix,
  reportedNode,
  unfixed,
  type Descriptor,
  type FixGuard,
  type GuardContext,
} from '../guard-types.mts';

type Callback = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type SourceText = GuardContext['sourceCode'];

function isFilterCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const { property } = callee;
  return callee.computed
    ? property.type === AST_NODE_TYPES.Literal && property.value === 'filter'
    : property.type === AST_NODE_TYPES.Identifier && property.name === 'filter';
}

function isCallback(node: TSESTree.Node): node is Callback {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function returnedOf(callback: Callback): TSESTree.Expression | undefined {
  const { body } = callback;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return body;
  }
  const [only] = body.body;
  return body.body.length === 1 && only?.type === AST_NODE_TYPES.ReturnStatement
    ? (only.argument ?? undefined)
    : undefined;
}

function isPurePredicate(argument: TSESTree.Node | undefined, sourceCode: SourceText): boolean {
  if (argument?.type === AST_NODE_TYPES.Identifier) {
    return argument.name === 'Boolean';
  }
  if (argument === undefined || !isCallback(argument) || argument.async || argument.generator) {
    return false;
  }
  const returned = returnedOf(argument);
  return (
    returned !== undefined &&
    argument.params.every((param) => param.type === AST_NODE_TYPES.Identifier) &&
    isSideEffectFree(toTerm(returned, sourceCode))
  );
}

export function preferFindGuard(descriptor: Descriptor, context: GuardContext): Descriptor {
  const node = reportedNode(descriptor, 'preferFind');
  if (node === undefined) {
    return descriptor;
  }
  const calls = [...outsideFunctions(node)].filter(isFilterCall);
  const pure =
    calls.length > 0 &&
    calls.every((call) => isPurePredicate(call.arguments[0], context.sourceCode));
  return pure ? keptFix(descriptor) : unfixed(descriptor);
}

export const PREFER_FIND: FixGuard = { status: 'review', guard: preferFindGuard };
