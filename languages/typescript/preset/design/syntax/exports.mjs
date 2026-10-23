import ts from 'typescript';

export function exportedNodes(checker, sourceFile) {
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
