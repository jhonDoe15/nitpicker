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
};

type Pending = { readonly type: TypeScript.Type; readonly depth: number };

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

function directName(type: TypeScript.Type): string | undefined {
  if ((type.flags & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) !== 0) {
    return 'bigint';
  }
  if ((type.flags & ts.TypeFlags.Object) === 0) {
    return undefined;
  }
  const name = type.getSymbol()?.getName() ?? '';
  return LOSSY_CLASSES.has(name) ? name : undefined;
}

function childrenOf(walk: Walk, { type, depth }: Pending): Pending[] {
  if (type.isUnionOrIntersection()) {
    return type.types.map((part) => ({ type: part, depth }));
  }
  if ((type.flags & ts.TypeFlags.Object) === 0 || hasToJson(type)) {
    return [];
  }
  return [...elementTypes(walk, type), ...memberTypes(walk, type)].map((part) => ({
    type: part,
    depth: depth + 1,
  }));
}

export function lossyTypeOf(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
  type: TypeScript.Type,
): string | undefined {
  const walk = { checker, node };
  const seen = new Set<TypeScript.Type>();
  const pending: Pending[] = [{ type, depth: 0 }];
  for (const [index, item] of pending.entries()) {
    if (item.depth > MAX_DEPTH || seen.has(item.type)) {
      continue;
    }
    seen.add(item.type);
    const name = directName(item.type);
    if (name !== undefined) {
      return name;
    }
    for (const child of childrenOf(walk, item).reverse()) {
      pending.splice(index + 1, 0, child);
    }
  }
  return undefined;
}
