import type TypeScript from 'typescript';
import { chainOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { syntaxChildren } from '../../syntax/children.mts';
import type { NamedType } from '../typed/context-types.mts';
import { depthFirst } from '../typed/syntax-views.mts';

const ts = typescriptApi();

function isNamedType(node: TypeScript.Node): node is NamedType {
  return ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node);
}

export function ownerType(member: TypeScript.Node): NamedType | undefined {
  return chainOf(member.parent, (node) => node.parent).find(isNamedType);
}

function referencedTypeName(node: TypeScript.Node): TypeScript.Identifier | undefined {
  if (ts.isTypeReferenceNode(node)) {
    return ts.isIdentifier(node.typeName) ? node.typeName : node.typeName.right;
  }
  return ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)
    ? node.expression
    : undefined;
}

function declarationsOf(
  checker: TypeScript.TypeChecker,
  name: TypeScript.Identifier,
): TypeScript.Declaration[] {
  const symbol = checker.getSymbolAtLocation(name);
  const resolved =
    symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return resolved?.declarations ?? [];
}

function typeUses(
  sourceFile: TypeScript.SourceFile,
  {
    checker,
    owners,
    names,
  }: {
    readonly checker: TypeScript.TypeChecker;
    readonly owners: ReadonlySet<TypeScript.Node>;
    readonly names: ReadonlySet<string>;
  },
): TypeScript.Declaration[] {
  return [...depthFirst(sourceFile, syntaxChildren)]
    .map(referencedTypeName)
    .filter((name): name is TypeScript.Identifier => name !== undefined && names.has(name.text))
    .flatMap((name) => declarationsOf(checker, name))
    .filter((declaration) => owners.has(declaration));
}

export function sharedTypes(
  {
    files,
    checker,
  }: { readonly files: readonly TypeScript.SourceFile[]; readonly checker: TypeScript.TypeChecker },
  owners: ReadonlySet<NamedType>,
): ReadonlySet<TypeScript.Node | undefined> {
  const names = new Set([...owners].map((owner) => owner.name.text));
  const uses = files.flatMap((sourceFile) => typeUses(sourceFile, { checker, owners, names }));
  const counts = Map.groupBy(uses, (declaration) => declaration);
  return new Set([...counts].filter(([, list]) => list.length > 1).map(([owner]) => owner));
}
