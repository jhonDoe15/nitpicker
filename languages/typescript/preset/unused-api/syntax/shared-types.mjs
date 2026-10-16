import ts from 'typescript';
import { chainOf, depthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../syntax/children.mjs';

function isNamedType(node) {
  return ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node);
}

/** The named type (alias or interface) a member is declared in, or undefined for an inline one. */
export function ownerType(member) {
  return chainOf(member.parent, (node) => node.parent).find(isNamedType);
}

function referencedTypeName(node) {
  if (ts.isTypeReferenceNode(node)) {
    return ts.isIdentifier(node.typeName) ? node.typeName : node.typeName.right;
  }
  return ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)
    ? node.expression
    : undefined;
}

function declarationsOf(checker, name) {
  const symbol = checker.getSymbolAtLocation(name);
  const resolved =
    symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return resolved?.declarations ?? [];
}

function typeUses(sourceFile, { checker, owners, names }) {
  return [...depthFirst(sourceFile, syntaxChildren)]
    .map(referencedTypeName)
    .filter((name) => name !== undefined && names.has(name.text))
    .flatMap((name) => declarationsOf(checker, name))
    .filter((declaration) => owners.has(declaration));
}

/**
 * The named types among `owners` that more than one place refers to: a domain type shared by
 * several functions or components, whose members no single caller has to set.
 */
export function sharedTypes({ files, checker }, owners) {
  const names = new Set([...owners].map((owner) => owner.name.text));
  const uses = files.flatMap((sourceFile) => typeUses(sourceFile, { checker, owners, names }));
  const counts = Map.groupBy(uses, (declaration) => declaration);
  return new Set([...counts].filter(([, list]) => list.length > 1).map(([owner]) => owner));
}
