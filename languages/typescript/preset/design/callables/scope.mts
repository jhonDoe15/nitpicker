import type TypeScript from 'typescript';
import { ts } from '../syntax/typed.mts';
import { descendants, thisOwner } from '../syntax/nodes.mts';
import type { Scope, Site, State } from '../design-types.mts';

export function createScope(state: State, site: Site): Scope {
  return {
    ...state,
    site,
    sourceFile: site.node.getSourceFile(),
    nodes: descendants(site.node),
    keys: new Map(),
    nameCounts: new Map(),
  };
}

export function isOwnerThis(scope: Pick<Scope, 'site'>, expression: TypeScript.Node): boolean {
  const owner = thisOwner(expression);
  return owner === scope.site.node || (owner === undefined && ts.isArrowFunction(scope.site.node));
}

export function symbolOf(
  scope: Pick<State, 'checker'>,
  identifier: TypeScript.Identifier | TypeScript.PrivateIdentifier,
): TypeScript.Symbol | undefined {
  const parent = identifier.parent;
  return ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
    ? scope.checker.getShorthandAssignmentValueSymbol(parent)
    : scope.checker.getSymbolAtLocation(identifier);
}

export function isValueDeclaration(
  declaration: TypeScript.Node | undefined,
): declaration is
  TypeScript.ParameterDeclaration | TypeScript.VariableDeclaration | TypeScript.BindingElement {
  return (
    declaration !== undefined &&
    (ts.isParameter(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isBindingElement(declaration))
  );
}

export function localKey(
  scope: Pick<Scope, 'checker' | 'sourceFile' | 'keys' | 'nameCounts'>,
  identifier: TypeScript.Identifier,
): string | undefined {
  const symbol = scope.checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.valueDeclaration;
  if (
    symbol === undefined ||
    !isValueDeclaration(declaration) ||
    declaration.getSourceFile() !== scope.sourceFile
  ) {
    return undefined;
  }
  if (!scope.keys.has(symbol)) {
    const seen = scope.nameCounts.get(symbol.name) ?? 0;
    scope.nameCounts.set(symbol.name, seen + 1);
    scope.keys.set(symbol, seen === 0 ? symbol.name : `${symbol.name}#${String(seen + 1)}`);
  }
  return scope.keys.get(symbol);
}
