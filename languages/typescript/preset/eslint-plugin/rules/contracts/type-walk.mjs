import ts from 'typescript';

const MAX_DEPTH = 8;

function isAnonymousObject(type) {
  return (
    (type.flags & ts.TypeFlags.Object) !== 0 &&
    (type.objectFlags & ts.ObjectFlags.Anonymous) !== 0 &&
    (type.symbol === undefined || type.symbol.name.startsWith('__'))
  );
}

function signatureTypes(checker, signature) {
  return [
    ...signature.getParameters().map((parameter) => checker.getTypeOfSymbol(parameter)),
    signature.getReturnType(),
  ];
}

function anonymousParts(checker, type) {
  return [
    ...type.getCallSignatures().flatMap((signature) => signatureTypes(checker, signature)),
    ...type.getProperties().map((property) => checker.getTypeOfSymbol(property)),
  ];
}

function typeArguments(checker, type) {
  return (type.flags & ts.TypeFlags.Object) !== 0 &&
    (type.objectFlags & ts.ObjectFlags.Reference) !== 0
    ? checker.getTypeArguments(type)
    : [];
}

function partsOf(checker, type) {
  if (type.isUnionOrIntersection()) {
    return type.types;
  }
  return [
    ...(type.aliasTypeArguments ?? []),
    ...typeArguments(checker, type),
    ...(isAnonymousObject(type) ? anonymousParts(checker, type) : []),
  ];
}

export function findInType(checker, root, match) {
  const seen = new Set();
  const found = [];
  const pending = [{ type: root, depth: 0 }];
  for (const { type, depth } of pending) {
    if (seen.has(type) || depth > MAX_DEPTH) {
      continue;
    }
    seen.add(type);
    const hit = match(type);
    if (hit === undefined) {
      pending.push(...partsOf(checker, type).map((part) => ({ type: part, depth: depth + 1 })));
    } else {
      found.push(hit);
    }
  }
  return found;
}

export function typeSymbols(type) {
  return [type.aliasSymbol, type.getSymbol()].filter((symbol) => symbol !== undefined);
}

export function callSignatureTypes(checker, signature) {
  return {
    parameters: signature.getParameters().map((parameter) => checker.getTypeOfSymbol(parameter)),
    returns: signature.getReturnType(),
  };
}
