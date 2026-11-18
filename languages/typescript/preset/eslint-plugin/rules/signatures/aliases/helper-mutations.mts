import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveFunction } from '../../analysis/constant-resolution.mts';
import { ancestorsOf, depthFirst, nodeChildren } from '../../typed/node-views.mts';
import { isFunction, type FunctionNode } from '../../typed/syntax-views.mts';
import { isReassignedFromCall } from '../parameter-copies.mts';
import { changedParameter, isInternalFunction } from '../parameter-owners.mts';
import { mutationAt, parameterWalk, type MutationScope } from './mutations.mts';

type ParameterDefinition = NonNullable<ReturnType<typeof changedParameter>>;

export type HelperCall = {
  readonly callee: string;
  readonly argument: TSESTree.Node;
  readonly parameter: ParameterDefinition;
};

function parameterIndex(fn: FunctionNode, name: TSESTree.Node): number {
  return fn.params.findIndex(
    (param) => (param.type === AST_NODE_TYPES.AssignmentPattern ? param.left : param) === name,
  );
}

function mutatedIndexes(scope: MutationScope, fn: FunctionNode): Set<number> {
  const walk = parameterWalk(scope);
  const indexes = new Set<number>();
  for (const node of depthFirst<TSESTree.Node>(fn.body, nodeChildren)) {
    const mutation = mutationAt(scope, node);
    const definition =
      mutation === undefined
        ? undefined
        : changedParameter({ ...walk, includeInternal: true }, mutation.object, node);
    if (definition !== undefined && definition.node === fn) {
      indexes.add(parameterIndex(fn, definition.name));
    }
  }
  return indexes;
}

export function helperMutation(
  scope: MutationScope,
  call: TSESTree.CallExpression,
  cache: Map<FunctionNode, Set<number>>,
): HelperCall | undefined {
  const helper = resolveFunction(scope, call.callee);
  if (
    helper === undefined ||
    !isFunction(helper) ||
    !isInternalFunction(helper) ||
    ancestorsOf(helper).some(isFunction)
  ) {
    return undefined;
  }
  const mutated = cache.get(helper) ?? mutatedIndexes(scope, helper);
  cache.set(helper, mutated);
  const walk = parameterWalk(scope);
  for (const [position, argument] of call.arguments.entries()) {
    const parameter =
      mutated.has(position) && argument.type !== AST_NODE_TYPES.SpreadElement
        ? changedParameter(walk, argument, call)
        : undefined;
    if (parameter !== undefined && !isReassignedFromCall(call, argument)) {
      return { callee: scope.sourceCode.getText(call.callee), argument, parameter };
    }
  }
  return undefined;
}
