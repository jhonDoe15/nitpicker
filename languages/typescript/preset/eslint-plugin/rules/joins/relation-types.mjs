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

function typeOf(types, node) {
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

function firstArgument(types, type) {
  return type.aliasTypeArguments?.[0] ?? typeArguments(types, type)[0];
}

function partRelation(types, part) {
  if (types.checker.isArrayType(part)) {
    return { many: true, target: typeArguments(types, part)[0] };
  }
  if (COLLECTIONS.has(nameOf(part))) {
    return { many: true, target: firstArgument(types, part) };
  }
  return undefined;
}

function unwrappedPart(types, part) {
  return WRAPPERS.has(nameOf(part)) ? firstArgument(types, part) : undefined;
}

function relationOf(types, type) {
  const pending = [types.checker.getNonNullableType(type)];
  for (const plain of pending) {
    const found = parts(plain)
      .map((part) => partRelation(types, part))
      .find(Boolean);
    if (found !== undefined) {
      return found;
    }
    const inner = parts(plain)
      .map((part) => unwrappedPart(types, part))
      .find(Boolean);
    if (inner === undefined || pending.length > MAX_UNWRAP) {
      return { many: false, target: parts(plain)[0] };
    }
    pending.push(types.checker.getNonNullableType(inner));
  }
  return undefined;
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
  return symbol === undefined ? undefined : relationOf(types, declaredType(types, symbol));
}

export function relationsTo(types, owner, target) {
  const wanted = target?.getSymbol();
  if (owner === undefined || wanted === undefined) {
    return [];
  }
  return types.checker
    .getPropertiesOfType(owner)
    .map((symbol) => [symbol.getName(), relationOf(types, declaredType(types, symbol))])
    .filter(([, relation]) => relation.target?.getSymbol() === wanted);
}

export function typeArgumentOf(types, node) {
  return typeArguments(types, types.checker.getNonNullableType(typeOf(types, node)))[0];
}

export function instanceOf(types, node) {
  const [signature] = typeOf(types, node).getConstructSignatures();
  return signature?.getReturnType();
}

function innerList(types, plain) {
  if (types.checker.isTupleType(plain)) {
    return typeArguments(types, plain)[0];
  }
  const rows = types.checker.getPropertyOfType(plain, 'rows');
  return rows === undefined ? undefined : types.checker.getTypeOfSymbol(rows);
}

function listElement(types, type) {
  const pending = [type];
  for (const current of pending) {
    const plain = types.checker.getNonNullableType(current);
    if (types.checker.isArrayType(plain)) {
      return typeArguments(types, plain)[0];
    }
    const inner = innerList(types, plain);
    if (inner === undefined || pending.length > MAX_UNWRAP) {
      return parts(plain)[0];
    }
    pending.push(inner);
  }
  return undefined;
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
