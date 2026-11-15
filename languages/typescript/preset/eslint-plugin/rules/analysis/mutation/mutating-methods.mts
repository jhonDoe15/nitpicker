import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';

const DELETE = 'delete';
const ARRAY_MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);
const TYPED_ARRAY_MUTATORS = new Set(['set', 'sort', 'reverse', 'fill', 'copyWithin']);
const OWNER_MUTATORS = new Map([
  ['Array', ARRAY_MUTATORS],
  ['Set', new Set(['add', DELETE, 'clear'])],
  ['WeakSet', new Set(['add', DELETE])],
  ['Map', new Set(['set', DELETE, 'clear'])],
  ['WeakMap', new Set(['set', DELETE])],
  ['URLSearchParams', new Set(['append', DELETE, 'set', 'sort'])],
]);
const TYPED_ARRAY =
  /^(Int8|Uint8|Uint8Clamped|Int16|Uint16|Int32|Uint32|Float16|Float32|Float64|BigInt64|BigUint64)Array$/;
const DATE_SETTER =
  /^set(UTC)?(FullYear|Month|Date|Hours|Minutes|Seconds|Milliseconds)$|^set(Time|Year)$/;
const BUFFER_WRITER = /^(write|swap)/;

function mutates(owner: string, method: string): boolean {
  if (owner === 'Date') {
    return DATE_SETTER.test(method);
  }
  if (owner === 'Buffer') {
    return BUFFER_WRITER.test(method);
  }
  if (TYPED_ARRAY.test(owner)) {
    return TYPED_ARRAY_MUTATORS.has(method);
  }
  return OWNER_MUTATORS.get(owner)?.has(method) === true;
}

export function staticName(
  node: TSESTree.MemberExpression,
  services: ParserServicesWithTypeInformation,
): string | undefined {
  if (!node.computed) {
    return node.property.type === AST_NODE_TYPES.Identifier ? node.property.name : undefined;
  }
  const type = services.getTypeAtLocation(node.property);
  return type.isStringLiteral() ? type.value : undefined;
}

function partsOf(type: TypeScript.Type): readonly TypeScript.Type[] {
  return type.isUnion() || type.isIntersection() ? type.types : [type];
}

function ownerOf(declaration: TypeScript.Declaration): string | undefined {
  const parent: unknown = declaration.parent;
  return typeof parent === 'object' &&
    parent !== null &&
    'name' in parent &&
    typeof parent.name === 'object' &&
    parent.name !== null &&
    'text' in parent.name &&
    typeof parent.name.text === 'string'
    ? parent.name.text
    : undefined;
}

function ownersOf(property: TypeScript.Symbol | undefined): string[] {
  return (property?.declarations ?? []).map(ownerOf).filter((name) => name !== undefined);
}

export function mutatedOwner(
  node: TSESTree.MemberExpression,
  method: string,
  services: ParserServicesWithTypeInformation,
): string | undefined {
  const checker = services.program.getTypeChecker();
  const receiver = services.getTypeAtLocation(node.object);
  return partsOf(receiver)
    .flatMap((part) => ownersOf(checker.getApparentType(part).getProperty(method)))
    .find((owner) => mutates(owner, method));
}

export function isArrayMutator(method: string): boolean {
  return ARRAY_MUTATORS.has(method);
}
