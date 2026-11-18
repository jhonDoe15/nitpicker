import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../../../eslint-plugin/rules/typed/typescript-views.mts';
import {
  demoted,
  reportedNode,
  type Descriptor,
  type FixGuard,
  type GuardContext,
} from '../guard-types.mts';

const SAME_UNDER_BOTH =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.EnumLiteral |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Null |
  ts.TypeFlags.Never |
  ts.TypeFlags.Object |
  ts.TypeFlags.NonPrimitive;
const STRING_LIKE = ts.TypeFlags.StringLike;

type Services = ParserServicesWithTypeInformation;

function isTyped(services: GuardContext['sourceCode']['parserServices']): services is Services {
  return services?.program !== null && services?.program !== undefined;
}

function isTypeParameter(type: TypeScript.Type): boolean {
  return (type.flags & ts.TypeFlags.TypeParameter) !== 0;
}

function everyPart(checker: TypeScript.TypeChecker, type: TypeScript.Type, flags: number): boolean {
  const resolved = isTypeParameter(type) ? checker.getBaseConstraintOfType(type) : type;
  if (resolved === undefined || isTypeParameter(resolved)) {
    return false;
  }
  if (resolved.isUnionOrIntersection()) {
    return resolved.types.every((part) => everyPart(checker, part, flags));
  }
  return (resolved.flags & flags) !== 0;
}

function searchedCall(node: TSESTree.Node): TSESTree.CallExpression | undefined {
  if (node.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  const { left } = node;
  return left.type === AST_NODE_TYPES.CallExpression &&
    left.callee.type === AST_NODE_TYPES.MemberExpression
    ? left
    : undefined;
}

function keepsResult(services: Services, call: TSESTree.CallExpression): boolean {
  const [argument] = call.arguments;
  if (argument === undefined || argument.type === AST_NODE_TYPES.SpreadElement) {
    return false;
  }
  if (call.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const searched = services.getTypeAtLocation(argument);
  const receiver = services.getTypeAtLocation(call.callee.object);
  const onString = !everyPart(checker, receiver, ~STRING_LIKE);
  return everyPart(checker, searched, onString ? STRING_LIKE : SAME_UNDER_BOTH);
}

export function preferIncludesGuard(descriptor: Descriptor, context: GuardContext): Descriptor {
  const node = reportedNode(descriptor, 'preferIncludes');
  if (node === undefined) {
    return descriptor;
  }
  const services = context.sourceCode.parserServices;
  const call = searchedCall(node);
  return isTyped(services) && call !== undefined && keepsResult(services, call)
    ? descriptor
    : demoted(descriptor);
}

export const PREFER_INCLUDES: FixGuard = { status: 'review', guard: preferIncludesGuard };
