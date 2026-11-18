import type TypeScript from 'typescript';
import { isReference, ts } from '../typed/typescript-views.mts';

const LOSSY_CLASSES = new Set([
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'RegExp',
  'ReadonlyMap',
  'ReadonlySet',
]);
const MAX_DEPTH = 3;
const MAX_PROPERTIES = 30;

type Walk = {
  readonly checker: TypeScript.TypeChecker;
  readonly node: TypeScript.Node;
  readonly seen: Set<TypeScript.Type>;
};

function hasToJson(type: TypeScript.Type): boolean {
  return type.getProperty('toJSON') !== undefined;
}

function elementTypes(walk: Walk, type: TypeScript.Type): readonly TypeScript.Type[] {
  const name = type.getSymbol()?.getName();
  const isList = name === 'Array' || name === 'ReadonlyArray' || walk.checker.isTupleType(type);
  return isList && isReference(type) ? walk.checker.getTypeArguments(type) : [];
}

function memberTypes(walk: Walk, type: TypeScript.Type): TypeScript.Type[] {
  const properties = type.getProperties();
  if (properties.length > MAX_PROPERTIES) {
    return [];
  }
  return [
    ...properties.map((property) => walk.checker.getTypeOfSymbolAtLocation(property, walk.node)),
    ...walk.checker.getIndexInfosOfType(type).map((info) => info.type),
  ];
}

export function lossyPart(walk: Walk, type: TypeScript.Type, depth = 0): string | undefined {
  if (depth > MAX_DEPTH || walk.seen.has(type)) {
    return undefined;
  }
  walk.seen.add(type);
  if ((type.flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) !== 0) {
    return 'bigint';
  }
  if (type.isUnionOrIntersection()) {
    return type.types
      .map((part) => lossyPart(walk, part, depth))
      .find((found) => found !== undefined);
  }
  if ((type.flags & ts.TypeFlags.Object) === 0) {
    return undefined;
  }
  const name = type.getSymbol()?.getName() ?? '';
  if (LOSSY_CLASSES.has(name)) {
    return name;
  }
  const inner = hasToJson(type) ? [] : [...elementTypes(walk, type), ...memberTypes(walk, type)];
  return inner.map((part) => lossyPart(walk, part, depth + 1)).find((found) => found !== undefined);
}

export function lossyTypeOf(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
  type: TypeScript.Type,
): string | undefined {
  return lossyPart({ checker, node, seen: new Set() }, type);
}
