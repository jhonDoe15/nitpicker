import type TypeScript from 'typescript';
import { ts } from './typed.mts';

export function exportedNodes(
  checker: TypeScript.TypeChecker,
  sourceFile: TypeScript.SourceFile,
): Set<TypeScript.Declaration> {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const symbols = moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol);
  return new Set(
    symbols.flatMap((symbol) => {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return [...(target.declarations ?? []), ...(symbol.declarations ?? [])];
    }),
  );
}
