import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, outerOf } from '../../collections/costly-forms/repeated-runs.mts';
import { contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { calleeNameOf, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import { isRepeatedRelativeTo, localFunctionFor } from '../support/ast-walk.mts';

export { isRepeatedRelativeTo } from '../support/ast-walk.mts';

const STREAMING_WRITER =
  /^(?:write(?:Pieces|Lines|JsonLines|Ndjson|Stream|Records|Chunks)|stream(?:Json|Lines|Pieces|Records|Chunks))$/u;

function isSinglePassUse(identifier: TSESTree.Node): boolean {
  const outer = outerOf(identifier);
  const { parent } = outer;
  if (parent?.type === AST_NODE_TYPES.ForOfStatement && parent.right === outer) {
    return true;
  }
  if (
    parent?.type === AST_NODE_TYPES.YieldExpression &&
    parent.delegate &&
    parent.argument === outer
  ) {
    return true;
  }
  if (
    parent?.type !== AST_NODE_TYPES.MemberExpression ||
    parent.object !== outer ||
    memberName(parent) !== 'forEach'
  ) {
    return false;
  }
  const call = outerOf(parent).parent;
  return call?.type === AST_NODE_TYPES.CallExpression && call.arguments.length === 1;
}

function isSinglePassParam(sourceCode: SourceCode, fn: FunctionNode, argIndex: number): boolean {
  const param = fn.params[argIndex];
  if (param?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const uses = (variableNamed(sourceCode, param)?.references ?? []).filter(
    (reference) => !reference.init && contains(fn.body, reference.identifier),
  );
  const [only] = uses;
  return (
    uses.length === 1 &&
    only !== undefined &&
    isSinglePassUse(only.identifier) &&
    !isRepeatedRelativeTo(only.identifier, fn)
  );
}

export function isSinglePassConsumer(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  argIndex: number,
): boolean {
  const callee = unwrapped(call.callee);
  const localFn = localFunctionFor(sourceCode, callee);
  if (localFn !== undefined) {
    return isSinglePassParam(sourceCode, localFn, argIndex);
  }
  const name = calleeNameOf(callee);
  return name !== undefined && STREAMING_WRITER.test(name);
}
