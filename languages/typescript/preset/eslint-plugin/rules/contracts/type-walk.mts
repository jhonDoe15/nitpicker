import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const MAX_DEPTH = 8;

function objectFlagsOf(type: TypeScript.Type): number {
  return 'objectFlags' in type && typeof type.objectFlags === 'number' ? type.objectFlags : 0;
}

function isReference(type: TypeScript.Type): type is TypeScript.TypeReference {
  return (
    (type.flags & ts.TypeFlags.Object) !== 0 &&
    (objectFlagsOf(type) & ts.ObjectFlags.Reference) !== 0
  );
}

function isAnonymousObject(type: TypeScript.Type): boolean {
  const symbol = type.getSymbol();
  return (
    (type.flags & ts.TypeFlags.Object) !== 0 &&
    (objectFlagsOf(type) & ts.ObjectFlags.Anonymous) !== 0 &&
    (symbol === undefined || symbol.name.startsWith('__'))
  );
}

function signatureTypes(
  checker: TypeScript.TypeChecker,
  signature: TypeScript.Signature,
): TypeScript.Type[] {
  return [
    ...signature.getParameters().map((parameter) => checker.getTypeOfSymbol(parameter)),
    signature.getReturnType(),
  ];
}

function anonymousParts(checker: TypeScript.TypeChecker, type: TypeScript.Type): TypeScript.Type[] {
  return [
    ...type.getCallSignatures().flatMap((signature) => signatureTypes(checker, signature)),
    ...type.getProperties().map((property) => checker.getTypeOfSymbol(property)),
  ];
}

function typeArguments(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): readonly TypeScript.Type[] {
  return isReference(type) ? checker.getTypeArguments(type) : [];
}

function partsOf(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
): readonly TypeScript.Type[] {
  if (type.isUnionOrIntersection()) {
    return type.types;
  }
  return [
    ...(type.aliasTypeArguments ?? []),
    ...typeArguments(checker, type),
    ...(isAnonymousObject(type) ? anonymousParts(checker, type) : []),
  ];
}

export function findInType<Hit>(
  checker: TypeScript.TypeChecker,
  root: TypeScript.Type,
  match: (type: TypeScript.Type) => Hit | undefined,
): Hit[] {
  const seen = new Set<TypeScript.Type>();
  const found: Hit[] = [];
  const pending = [{ type: root, depth: 0 }];
  for (const { type, depth } of pending) {
    if (seen.has(type) || depth > MAX_DEPTH) {
      continue;
    }
    seen.add(type);
    const hit = match(type);
    if (hit === undefined) {
      appendAll(
        pending,
        partsOf(checker, type).map((part) => ({ type: part, depth: depth + 1 })),
      );
    } else {
      found.push(hit);
    }
  }
  return found;
}

export function typeSymbols(type: TypeScript.Type): TypeScript.Symbol[] {
  return [type.aliasSymbol, type.getSymbol()].filter((symbol) => symbol !== undefined);
}

export function callSignatureTypes(
  checker: TypeScript.TypeChecker,
  signature: TypeScript.Signature,
): { readonly parameters: TypeScript.Type[]; readonly returns: TypeScript.Type } {
  return {
    parameters: signature.getParameters().map((parameter) => checker.getTypeOfSymbol(parameter)),
    returns: signature.getReturnType(),
  };
}
