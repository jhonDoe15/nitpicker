import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';

const ERROR_CLASS = /Error$/u;

function typeMembers(
  context: Context,
  node: TSESTree.Node,
): readonly TypeScript.Type[] | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  return type.isUnion() ? type.types : [type];
}

export function isObjectArgument(context: Context, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return node.callee.type === AST_NODE_TYPES.Identifier && ERROR_CLASS.test(node.callee.name);
  }
  const members = typeMembers(context, node);
  return (
    members !== undefined &&
    members.length > 0 &&
    members.every((member) => (member.flags & ts.TypeFlags.Object) !== 0)
  );
}

export function isPrimitiveArgument(context: Context, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return !('regex' in node);
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return true;
  }
  const members = typeMembers(context, node);
  const primitive = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike;
  return (
    members !== undefined &&
    members.length > 0 &&
    members.every((member) => (member.flags & primitive) !== 0)
  );
}
