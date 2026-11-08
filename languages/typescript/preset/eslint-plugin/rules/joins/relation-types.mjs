import { typeServices } from '../security/security-values.mjs';

const COLLECTIONS = new Set(['Collection', 'LoadedCollection']);
const WRAPPERS = new Set(['Ref', 'Reference', 'IdentifiedReference', 'LoadedReference', 'Promise']);
const MAX_UNWRAP = 4;

export function relationTypes(context) {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  return { services, checker: services.program.getTypeChecker() };
}

export function typeOf(types, node) {
  return types.services.getTypeAtLocation(node);
}

function typeArguments(types, type) {
  return type.target === undefined ? [] : types.checker.getTypeArguments(type);
}

function nameOf(type) {
  return type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
}

function parts(type) {
  return type.isIntersection() || type.isUnion() ? type.types : [type];
}

function relationOf(types, type, depth) {
  const plain = types.checker.getNonNullableType(type);
  for (const part of parts(plain)) {
    if (types.checker.isArrayType(part)) {
      return { many: true, target: typeArguments(types, part)[0] };
    }
    if (COLLECTIONS.has(nameOf(part))) {
      return { many: true, target: part.aliasTypeArguments?.[0] ?? typeArguments(types, part)[0] };
    }
    const inner = part.aliasTypeArguments?.[0] ?? typeArguments(types, part)[0];
    if (WRAPPERS.has(nameOf(part)) && inner !== undefined && depth < MAX_UNWRAP) {
      return relationOf(types, inner, depth + 1);
    }
  }
  return { many: false, target: parts(plain)[0] };
}

function declaredType(types, symbol) {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration?.type !== undefined) {
    return types.checker.getTypeFromTypeNode(declaration.type);
  }
  return declaration === undefined
    ? types.checker.getTypeOfSymbol(symbol)
    : types.checker.getTypeAtLocation(declaration);
}

export function relationNamed(types, owner, name) {
  const symbol = owner === undefined ? undefined : types.checker.getPropertyOfType(owner, name);
  return symbol === undefined ? undefined : relationOf(types, declaredType(types, symbol), 0);
}

export function relationsTo(types, owner, target) {
  const wanted = target?.getSymbol();
  if (owner === undefined || wanted === undefined) {
    return [];
  }
  return types.checker
    .getPropertiesOfType(owner)
    .map((symbol) => [symbol.getName(), relationOf(types, declaredType(types, symbol), 0)])
    .filter(([, relation]) => relation.target?.getSymbol() === wanted);
}

export function typeArgumentOf(types, node) {
  return typeArguments(types, types.checker.getNonNullableType(typeOf(types, node)))[0];
}

export function instanceOf(types, node) {
  const [signature] = typeOf(types, node).getConstructSignatures();
  return signature?.getReturnType();
}

function listElement(types, type) {
  const plain = types.checker.getNonNullableType(type);
  if (types.checker.isTupleType(plain)) {
    return listElement(types, typeArguments(types, plain)[0]);
  }
  if (types.checker.isArrayType(plain)) {
    return typeArguments(types, plain)[0];
  }
  const rows = types.checker.getPropertyOfType(plain, 'rows');
  return rows === undefined
    ? parts(plain)[0]
    : listElement(types, types.checker.getTypeOfSymbol(rows));
}

export function resultEntity(types, call) {
  const type = typeOf(types, call);
  return listElement(types, types.checker.getAwaitedType(type) ?? type);
}

export function declaredInPackage(types, call, packages) {
  const node = types.services.esTreeNodeToTSNodeMap.get(call);
  const file = types.checker.getResolvedSignature(node)?.getDeclaration()?.getSourceFile().fileName;
  const normalized = file?.replaceAll('\\', '/') ?? '';
  return packages.some((name) => normalized.includes(`/node_modules/${name}/`));
}

function isNested(outer, inner) {
  return inner.startsWith(`${outer}.`);
}

export function crossedCollections(joined) {
  const collections = [...joined].filter(([, many]) => many).map(([key]) => key);
  for (const [index, first] of collections.entries()) {
    const second = collections
      .slice(index + 1)
      .find((other) => !isNested(first, other) && !isNested(other, first));
    if (second !== undefined) {
      return { first, second };
    }
  }
  return undefined;
}

export function joinPaths(types, root, paths) {
  const joined = new Map();
  for (const segments of paths) {
    segments.reduce(
      (owner, segment) => {
        const relation =
          owner === undefined ? undefined : relationNamed(types, owner.type, segment);
        if (relation === undefined) {
          return undefined;
        }
        const key = owner.key === '' ? segment : `${owner.key}.${segment}`;
        joined.set(key, relation.many);
        return { key, type: relation.target };
      },
      { key: '', type: root },
    );
  }
  return joined;
}
