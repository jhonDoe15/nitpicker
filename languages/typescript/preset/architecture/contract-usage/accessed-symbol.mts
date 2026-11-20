import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';

const ts = typescriptApi();

export type SymbolLookup = {
  readonly checker: TypeScript.TypeChecker;
  readonly names: ReadonlySet<string>;
};

function propertySymbol(
  node: TypeScript.PropertyAccessExpression,
  { checker, names }: SymbolLookup,
): TypeScript.Symbol | undefined {
  return names.has(node.name.text) ? checker.getSymbolAtLocation(node.name) : undefined;
}

function elementSymbol(
  node: TypeScript.ElementAccessExpression,
  { checker, names }: SymbolLookup,
): TypeScript.Symbol | undefined {
  const argument = node.argumentExpression;
  return ts.isStringLiteralLike(argument) && !names.has(argument.text)
    ? undefined
    : checker.getSymbolAtLocation(argument);
}

function destructuredSymbol(
  node: TypeScript.BindingElement,
  { checker, names }: SymbolLookup,
): TypeScript.Symbol | undefined {
  const declaration = node.parent.parent;
  if (
    !ts.isObjectBindingPattern(node.parent) ||
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer === undefined
  ) {
    return undefined;
  }
  const name = node.propertyName ?? node.name;
  return ts.isIdentifier(name) && names.has(name.text)
    ? checker.getTypeAtLocation(declaration.initializer).getProperty(name.text)
    : undefined;
}

export function accessedSymbol(
  node: TypeScript.Node,
  lookup: SymbolLookup,
): TypeScript.Symbol | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return propertySymbol(node, lookup);
  }
  if (ts.isElementAccessExpression(node)) {
    return elementSymbol(node, lookup);
  }
  return ts.isBindingElement(node) ? destructuredSymbol(node, lookup) : undefined;
}
