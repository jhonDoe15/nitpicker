import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type { Registry, Target } from '../typed/context-types.mts';

const ts = typescriptApi();

export function createRegistry(): Registry {
  const byDeclaration = new Map<TypeScript.Node, Target>();
  const targets: Target[] = [];
  const names = new Set<string>();
  return {
    byDeclaration,
    targets,
    names,
    cloned: [],
    register(target, keyNodes) {
      targets.push(target);
      names.add(target.name);
      for (const node of keyNodes) {
        byDeclaration.set(node, target);
      }
    },
    alias(target, node, name) {
      byDeclaration.set(node, target);
      names.add(name);
    },
  };
}

export function register(
  registry: Registry,
  { target, keyNodes }: { readonly target: Target; readonly keyNodes: readonly TypeScript.Node[] },
): void {
  registry.register(target, keyNodes);
}

export function addAlias(
  registry: Registry,
  {
    target,
    node,
    name,
  }: { readonly target: Target; readonly node: TypeScript.Node; readonly name: string },
): void {
  registry.alias(target, node, name);
}

function valueSymbol(
  checker: TypeScript.TypeChecker,
  identifier: TypeScript.Node,
): TypeScript.Symbol | undefined {
  const parent = identifier.parent;
  return ts.isShorthandPropertyAssignment(parent) && parent.name === identifier
    ? checker.getShorthandAssignmentValueSymbol(parent)
    : checker.getSymbolAtLocation(identifier);
}

export function referencedSymbol(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.Symbol | undefined {
  const identifier = ts.isPropertyAccessExpression(node) ? node.name : node;
  const symbol = valueSymbol(checker, identifier);
  return symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function targetOfSymbol(
  registry: Registry,
  symbol: TypeScript.Symbol | undefined,
): Target | undefined {
  for (const declaration of symbol?.declarations ?? []) {
    const target = registry.byDeclaration.get(declaration);
    if (target !== undefined) {
      return target;
    }
  }
  return undefined;
}

export function targetOf(
  { checker, registry }: { readonly checker: TypeScript.TypeChecker; readonly registry: Registry },
  node: TypeScript.Node,
): Target | undefined {
  return targetOfSymbol(registry, referencedSymbol(checker, node));
}
