import ts from 'typescript';
import { isNestController } from './decorators.mjs';
import { infrastructureOf } from './infrastructure-types.mjs';
import { callSignatureTypes, findInType, typeSymbols } from './type-walk.mjs';

const HIDDEN = ts.ModifierFlags.Private | ts.ModifierFlags.Protected;

function resolved(checker, symbol) {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

function infrastructureIn(checker, type) {
  return findInType(checker, type, (candidate) =>
    typeSymbols(candidate)
      .map((symbol) => infrastructureOf(symbol))
      .find((found) => found !== undefined),
  );
}

function isHandlerSignature(checker, signature) {
  const [first] = signature.getParameters();
  return (
    first !== undefined &&
    infrastructureIn(checker, checker.getTypeOfSymbol(first)).some((found) => found.request)
  );
}

function signatureLeaks(checker, signature, allowTransport) {
  const handler = allowTransport || isHandlerSignature(checker, signature);
  const { parameters, returns } = callSignatureTypes(checker, signature);
  return [...parameters, returns]
    .flatMap((type) => infrastructureIn(checker, type))
    .filter((found) => !(handler && found.kind === 'transport'));
}

function isPublic(symbol) {
  return (symbol.declarations ?? []).every(
    (declaration) =>
      (ts.getCombinedModifierFlags(declaration) & HIDDEN) === 0 &&
      !ts.isPrivateIdentifier(declaration.name ?? declaration),
  );
}

function callableMembers(checker, type) {
  return type
    .getProperties()
    .filter((property) => property.name !== 'prototype' && isPublic(property))
    .map((property) => ({
      name: property.name,
      signatures: checker.getTypeOfSymbol(property).getCallSignatures(),
    }))
    .filter(({ signatures }) => signatures.length > 0);
}

function memberLeaks(checker, members, { label, allowTransport }) {
  return members.flatMap(({ name, signatures }) =>
    signatures
      .flatMap((signature) => signatureLeaks(checker, signature, allowTransport))
      .map((found) => ({ member: `${label}.${name}`, found })),
  );
}

function classLeaks(checker, symbol, label) {
  const declaration = symbol.declarations.find(ts.isClassLike);
  const allowTransport = declaration !== undefined && isNestController(checker, declaration);
  const instance = callableMembers(checker, checker.getDeclaredTypeOfSymbol(symbol));
  const statics = callableMembers(checker, checker.getTypeOfSymbol(symbol));
  return memberLeaks(checker, [...instance, ...statics], { label, allowTransport });
}

function isProjectObject(type) {
  return (
    (type.flags & ts.TypeFlags.Object) !== 0 &&
    (type.getSymbol()?.declarations ?? []).some(
      (declaration) => !declaration.getSourceFile().isDeclarationFile,
    )
  );
}

function returnedMembers(checker, signature) {
  const returns = signature.getReturnType();
  const awaited = checker.getAwaitedType(returns) ?? returns;
  return isProjectObject(awaited) ? callableMembers(checker, awaited) : [];
}

function functionLeaks(checker, signatures, label) {
  return signatures.flatMap((signature) => {
    const direct = signatureLeaks(checker, signature, false);
    const returnLeaks = infrastructureIn(checker, signature.getReturnType());
    const members = returnLeaks.length === 0 ? returnedMembers(checker, signature) : [];
    return members.length === 0
      ? direct.map((found) => ({ member: label, found }))
      : memberLeaks(checker, members, { label: `${label}()`, allowTransport: false });
  });
}

function typeLeaks(checker, type, label) {
  const own = functionLeaks(checker, type.getCallSignatures(), label);
  return [
    ...own,
    ...memberLeaks(checker, callableMembers(checker, type), { label, allowTransport: false }),
  ];
}

const OWN_LEAKS = ts.SymbolFlags.Class | ts.SymbolFlags.Function | ts.SymbolFlags.Variable;
const TYPE_LEAKS = ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias;

function symbolLeaks(checker, symbol, label) {
  if ((symbol.flags & ts.SymbolFlags.Class) !== 0) {
    return classLeaks(checker, symbol, label);
  }
  if ((symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable)) !== 0) {
    return typeLeaks(checker, checker.getTypeOfSymbol(symbol), label);
  }
  return (symbol.flags & TYPE_LEAKS) === 0
    ? []
    : typeLeaks(checker, checker.getDeclaredTypeOfSymbol(symbol), label);
}

function isNamespace(symbol) {
  return (
    (symbol.flags & ts.SymbolFlags.ValueModule) !== 0 &&
    (symbol.flags & (OWN_LEAKS | TYPE_LEAKS)) === 0
  );
}

export function exportLeaks(checker, exported) {
  const leaks = [];
  const seen = new Set();
  const pending = [{ entry: exported, label: exported.name }];
  for (const { entry, label } of pending) {
    const symbol = resolved(checker, entry);
    if (!seen.has(symbol)) {
      seen.add(symbol);
      leaks.push(...symbolLeaks(checker, symbol, label));
      const inner = isNamespace(symbol) ? checker.getExportsOfModule(symbol) : [];
      pending.push(...inner.map((child) => ({ entry: child, label: `${label}.${child.name}` })));
    }
  }
  return leaks;
}
