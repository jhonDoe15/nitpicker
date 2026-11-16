import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, unwrapped } from '../../security/security-values.mts';
import type { FunctionNode } from '../../typed/syntax-views.mts';

function returnedValue(callback: FunctionNode): TSESTree.Node | undefined {
  const { body } = callback;
  const single =
    body.type === AST_NODE_TYPES.BlockStatement && body.body.length === 1
      ? body.body[0]
      : undefined;
  const value = single?.type === AST_NODE_TYPES.ReturnStatement ? single.argument : body;
  return value === null || value === undefined || value.type === AST_NODE_TYPES.BlockStatement
    ? undefined
    : unwrapped(value);
}

export function soleField(callback: FunctionNode): string | undefined {
  const [param] = callback.params;
  const value = returnedValue(callback);
  if (param?.type === AST_NODE_TYPES.Identifier) {
    const member =
      value?.type === AST_NODE_TYPES.MemberExpression && !value.computed ? value : undefined;
    const object = member === undefined ? undefined : unwrapped(member.object);
    return member !== undefined &&
      object?.type === AST_NODE_TYPES.Identifier &&
      object.name === param.name
      ? memberName(member)
      : undefined;
  }
  const [only, ...rest] = param?.type === AST_NODE_TYPES.ObjectPattern ? param.properties : [];
  if (
    rest.length !== 0 ||
    only?.type !== AST_NODE_TYPES.Property ||
    only.value.type !== AST_NODE_TYPES.Identifier ||
    only.computed ||
    value?.type !== AST_NODE_TYPES.Identifier ||
    value.name !== only.value.name
  ) {
    return undefined;
  }
  return only.key.type === AST_NODE_TYPES.Identifier ? only.key.name : undefined;
}
