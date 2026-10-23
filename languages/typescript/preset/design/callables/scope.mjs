import ts from 'typescript';
import { descendants, thisOwner } from '../syntax/nodes.mjs';

export function createScope(state, site) {
  return {
    ...state,
    site,
    sourceFile: site.node.getSourceFile(),
    nodes: descendants(site.node),
    keys: new Map(),
    nameCounts: new Map(),
  };
}

export function isOwnerThis(scope, expression) {
  const owner = thisOwner(expression);
  return owner === scope.site.node || (owner === undefined && ts.isArrowFunction(scope.site.node));
}

export function symbolOf(scope, identifier) {
  const parent = identifier.parent;
  return ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
    ? scope.checker.getShorthandAssignmentValueSymbol(parent)
    : scope.checker.getSymbolAtLocation(identifier);
}

export function isValueDeclaration(declaration) {
  return (
    declaration !== undefined &&
    (ts.isParameter(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isBindingElement(declaration))
  );
}

export function localKey(scope, identifier) {
  const symbol = scope.checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.valueDeclaration;
  if (!isValueDeclaration(declaration) || declaration.getSourceFile() !== scope.sourceFile) {
    return undefined;
  }
  if (!scope.keys.has(symbol)) {
    const seen = scope.nameCounts.get(symbol.name) ?? 0;
    scope.nameCounts.set(symbol.name, seen + 1);
    scope.keys.set(symbol, seen === 0 ? symbol.name : `${symbol.name}#${String(seen + 1)}`);
  }
  return scope.keys.get(symbol);
}
