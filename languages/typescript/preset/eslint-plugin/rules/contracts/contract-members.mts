import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { isNestController } from './decorators.mts';
import { infrastructureOf, type Infrastructure } from './infrastructure-types.mts';
import { callSignatureTypes, findInType, typeSymbols } from './type-walk.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type Checker = TypeScript.TypeChecker;
type Leak = { readonly member: string; readonly found: Infrastructure };
type Members = { readonly name: string; readonly signatures: readonly TypeScript.Signature[] }[];
type MemberScope = { readonly label: string; readonly allowTransport: boolean };

const HIDDEN = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;

function resolved(checker: Checker, symbol: TypeScript.Symbol): TypeScript.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

function infrastructureIn(checker: Checker, type: TypeScript.Type): Infrastructure[] {
  return findInType(checker, type, (candidate) =>
    typeSymbols(candidate)
      .map((symbol) => infrastructureOf(symbol))
      .find((found) => found !== undefined),
  );
}

function isHandlerSignature(checker: Checker, signature: TypeScript.Signature): boolean {
  return signature
    .getParameters()
    .some((parameter) =>
      infrastructureIn(checker, checker.getTypeOfSymbol(parameter)).some(
        (found) => found.kind === 'transport' && found.request,
      ),
    );
}

function signatureLeaks(
  checker: Checker,
  signature: TypeScript.Signature,
  allowTransport: boolean,
): Infrastructure[] {
  const handler = allowTransport || isHandlerSignature(checker, signature);
  const { parameters, returns } = callSignatureTypes(checker, signature);
  return [...parameters, returns]
    .flatMap((type) => infrastructureIn(checker, type))
    .filter((found) => !(handler && found.kind === 'transport'));
}

function isNamed(declaration: TypeScript.Declaration): declaration is TypeScript.NamedDeclaration {
  return 'name' in declaration;
}

function isPublic(symbol: TypeScript.Symbol): boolean {
  return (symbol.declarations ?? []).every(
    (declaration) =>
      (ts.getCombinedModifierFlags(declaration) & HIDDEN) === 0 &&
      !ts.isPrivateIdentifier(
        isNamed(declaration) ? (declaration.name ?? declaration) : declaration,
      ),
  );
}

function isProjectDeclared(symbol: TypeScript.Symbol): boolean {
  return (symbol.declarations ?? []).some(
    (declaration) => !declaration.getSourceFile().isDeclarationFile,
  );
}

function callableMembers(checker: Checker, type: TypeScript.Type): Members {
  return type
    .getProperties()
    .filter(
      (property) =>
        property.name !== 'prototype' && isPublic(property) && isProjectDeclared(property),
    )
    .map((property) => ({
      name: property.name,
      signatures: checker.getTypeOfSymbol(property).getCallSignatures(),
    }))
    .filter(({ signatures }) => signatures.length > 0);
}

function memberLeaks(
  checker: Checker,
  members: Members,
  { label, allowTransport }: MemberScope,
): Leak[] {
  return members.flatMap(({ name, signatures }) =>
    signatures
      .flatMap((signature) => signatureLeaks(checker, signature, allowTransport))
      .map((found) => ({ member: `${label}.${name}`, found })),
  );
}

function isFactory(checker: Checker, signature: TypeScript.Signature): boolean {
  const returns = signature.getReturnType();
  return (
    (returns.flags & ts.TypeFlags.Object) !== 0 &&
    checker.getAwaitedType(returns) === returns &&
    !checker.isArrayLikeType(returns) &&
    returns.getCallSignatures().length === 0 &&
    infrastructureIn(checker, returns).length === 0
  );
}

function functionLeaks(
  checker: Checker,
  signatures: readonly TypeScript.Signature[],
  label: string,
): Leak[] {
  return signatures.flatMap((signature) => {
    if (!isFactory(checker, signature)) {
      return signatureLeaks(checker, signature, false).map((found) => ({ member: label, found }));
    }
    const members = callableMembers(checker, signature.getReturnType());
    return memberLeaks(checker, members, { label: `${label}()`, allowTransport: false });
  });
}

function classLeaks(checker: Checker, symbol: TypeScript.Symbol, label: string): Leak[] {
  const declaration = symbol.declarations?.find(ts.isClassLike);
  const allowTransport = declaration !== undefined && isNestController(checker, declaration);
  const instance = callableMembers(checker, checker.getDeclaredTypeOfSymbol(symbol));
  const statics = callableMembers(checker, checker.getTypeOfSymbol(symbol));
  return [
    ...memberLeaks(checker, instance, { label, allowTransport }),
    ...statics.flatMap(({ name, signatures }) =>
      functionLeaks(checker, signatures, `${label}.${name}`),
    ),
  ];
}

function typeLeaks(checker: Checker, type: TypeScript.Type, label: string): Leak[] {
  const own = functionLeaks(checker, type.getCallSignatures(), label);
  return [
    ...own,
    ...memberLeaks(checker, callableMembers(checker, type), { label, allowTransport: false }),
  ];
}

function heldInfrastructure(type: TypeScript.Type): Infrastructure[] {
  const parts = type.isUnion() ? type.types : [type];
  return parts
    .flatMap((part) => typeSymbols(part).map((symbol) => infrastructureOf(symbol)))
    .filter((found) => found !== undefined);
}

function variableLeaks(checker: Checker, type: TypeScript.Type, label: string): Leak[] {
  const held = heldInfrastructure(type);
  return held.length === 0
    ? typeLeaks(checker, type, label)
    : held.map((found) => ({ member: label, found }));
}

const OWN_LEAKS = ts.SymbolFlags.Class | ts.SymbolFlags.Function | ts.SymbolFlags.Variable;
const TYPE_LEAKS = ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias;

function symbolLeaks(checker: Checker, symbol: TypeScript.Symbol, label: string): Leak[] {
  if ((symbol.flags & ts.SymbolFlags.Class) !== 0) {
    return classLeaks(checker, symbol, label);
  }
  if ((symbol.flags & ts.SymbolFlags.Variable) !== 0) {
    return variableLeaks(checker, checker.getTypeOfSymbol(symbol), label);
  }
  if ((symbol.flags & ts.SymbolFlags.Function) !== 0) {
    return typeLeaks(checker, checker.getTypeOfSymbol(symbol), label);
  }
  return (symbol.flags & TYPE_LEAKS) === 0
    ? []
    : typeLeaks(checker, checker.getDeclaredTypeOfSymbol(symbol), label);
}

function isNamespace(symbol: TypeScript.Symbol): boolean {
  return (
    (symbol.flags & ts.SymbolFlags.ValueModule) !== 0 &&
    (symbol.flags & (OWN_LEAKS | TYPE_LEAKS)) === 0
  );
}

export function exportLeaks(checker: Checker, exported: TypeScript.Symbol): Leak[] {
  const leaks: Leak[] = [];
  const seen = new Set<TypeScript.Symbol>();
  const pending = [{ entry: exported, label: exported.name }];
  for (const { entry, label } of pending) {
    const symbol = resolved(checker, entry);
    if (!seen.has(symbol)) {
      seen.add(symbol);
      appendAll(leaks, symbolLeaks(checker, symbol, label));
      const inner = isNamespace(symbol) ? checker.getExportsOfModule(symbol) : [];
      appendAll(
        pending,
        inner.map((child) => ({ entry: child, label: `${label}.${child.name}` })),
      );
    }
  }
  return leaks;
}
