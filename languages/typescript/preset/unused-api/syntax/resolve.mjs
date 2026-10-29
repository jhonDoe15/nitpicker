import { ts } from '../../../typescript-api/typescript-api.mjs';

export function createRegistry() {
  return { byDeclaration: new Map(), targets: [], names: new Set(), cloned: [] };
}

export function register(registry, { target, keyNodes }) {
  registry.targets.push(target);
  registry.names.add(target.name);
  for (const node of keyNodes) registry.byDeclaration.set(node, target);
}

export function addAlias(registry, { target, node, name }) {
  registry.byDeclaration.set(node, target);
  registry.names.add(name);
}

function valueSymbol(checker, identifier) {
  const parent = identifier.parent;
  return ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
    ? checker.getShorthandAssignmentValueSymbol(parent)
    : checker.getSymbolAtLocation(identifier);
}

/** The symbol a name refers to, followed through imports and re-exports to its declaration. */
export function referencedSymbol(checker, node) {
  const identifier = ts.isPropertyAccessExpression(node) ? node.name : node;
  const symbol = valueSymbol(checker, identifier);
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function targetOfSymbol(registry, symbol) {
  for (const declaration of symbol?.declarations ?? []) {
    const target = registry.byDeclaration.get(declaration);
    if (target !== undefined) return target;
  }
  return undefined;
}

export function targetOf({ checker, registry }, node) {
  return targetOfSymbol(registry, referencedSymbol(checker, node));
}
