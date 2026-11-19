import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typeServices, type Context } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';

const OBJECT_KIND = 'object';
const SAFE_NAME =
  /(?:^|[a-z0-9])(?:id|Id|ID|uuid|Uuid|hash|Hash|index|Index|idx|count|length)$|^(?:i|j|n)$/u;
const CONVERSIONS = new Set(['toString', 'toFixed', 'toLocaleString']);
const VALUE_OBJECTS = new Set([
  'Date',
  'Array',
  'RegExp',
  'URL',
  'Error',
  'Boolean',
  'Number',
  'String',
]);

function nameOf(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
    ? node.property.name
    : undefined;
}

export type PartKind = 'string' | 'object';

function kindOfMember(member: TypeScript.Type): PartKind | undefined {
  if ((member.flags & ts.TypeFlags.String) !== 0) {
    return 'string';
  }
  const name = member.getSymbol()?.name ?? '';
  return (member.flags & ts.TypeFlags.Object) !== 0 && !VALUE_OBJECTS.has(name)
    ? OBJECT_KIND
    : undefined;
}

function isNumeric(member: TypeScript.Type): boolean {
  return (
    (member.flags &
      (ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike)) !==
    0
  );
}

function convertedValue(part: TSESTree.Node): TSESTree.Node | undefined {
  if (part.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const { callee } = part;
  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'String') {
    return part.arguments[0];
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    CONVERSIONS.has(callee.property.name)
    ? callee.object
    : undefined;
}

export function partKind(context: Context, part: TSESTree.Node): PartKind | undefined {
  const services = typeServices(context);
  if (services === undefined || SAFE_NAME.test(nameOf(part) ?? '')) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  const converted = convertedValue(part);
  if (converted !== undefined) {
    const inner = checker.getNonNullableType(services.getTypeAtLocation(converted));
    if ((inner.isUnion() ? inner.types : [inner]).every(isNumeric)) {
      return undefined;
    }
  }
  const type = checker.getNonNullableType(services.getTypeAtLocation(part));
  const kinds = (type.isUnion() ? type.types : [type]).map(kindOfMember);
  return kinds.includes(OBJECT_KIND) ? OBJECT_KIND : kinds.find((kind) => kind !== undefined);
}

export function receiverTypeName(context: Context, node: TSESTree.Node): string | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const checker = services.program.getTypeChecker();
  return checker.getNonNullableType(services.getTypeAtLocation(node)).getSymbol()?.name;
}

export function hasStringIndex(context: Context, node: TSESTree.Node): boolean {
  const services = typeServices(context);
  if (services === undefined) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(node));
  return (
    !checker.isArrayType(type) &&
    checker.getIndexInfoOfType(type, ts.IndexKind.String) !== undefined
  );
}
