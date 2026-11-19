import type TypeScript from 'typescript';
import { appendAll } from '../../../../../shared/lists/lists.mts';
import { chainOf, typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { targetOf, targetOfSymbol } from '../syntax/resolve.mts';
import type { ReferenceKindName, ReferenceState, Passes, Target } from '../typed/context-types.mts';

const ts = typescriptApi();

export function leftmost(node: TypeScript.Expression): TypeScript.Expression | undefined {
  return chainOf(node, (current) =>
    ts.isPropertyAccessExpression(current) ? current.expression : undefined,
  ).at(-1);
}

export function mayBeTarget(node: TypeScript.Node, state: ReferenceState): boolean {
  if (ts.isIdentifier(node)) {
    return state.names.has(node.text);
  }
  if (!ts.isPropertyAccessExpression(node)) {
    return false;
  }
  const root = leftmost(node);
  return (
    state.names.has(node.name.text) ||
    (root !== undefined && ts.isIdentifier(root) && state.namespaces.has(root.text))
  );
}

export function referencedComponent(
  node: TypeScript.Node | undefined,
  state: ReferenceState,
): Target | undefined {
  const isReference =
    node !== undefined && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node));
  const target = isReference && mayBeTarget(node, state) ? targetOf(state, node) : undefined;
  return target?.kind === 'component' ? target : undefined;
}

export function consume(node: TypeScript.Node, state: ReferenceState): void {
  state.consume(node);
  if (ts.isPropertyAccessExpression(node)) {
    state.consume(node.name);
  }
}

export function record({
  target,
  state,
  kind,
  passes,
}: {
  readonly target: Target;
  readonly state: ReferenceState;
  readonly kind: ReferenceKindName;
  readonly passes?: Passes;
}): void {
  appendAll(target.refs, [
    { kind, passes, role: state.file.role, packageDir: state.file.packageDir },
  ]);
}

function escapeSymbols({
  symbols,
  state,
}: {
  readonly symbols: readonly TypeScript.Symbol[];
  readonly state: ReferenceState;
}): void {
  for (const symbol of symbols) {
    const resolved =
      symbol.flags & ts.SymbolFlags.Alias ? state.checker.getAliasedSymbol(symbol) : symbol;
    const target = targetOfSymbol(state.registry, resolved);
    if (target !== undefined) {
      record({ target, state, kind: 'escape' });
    }
  }
}

export function escapeModule(
  moduleSymbol: TypeScript.Symbol | undefined,
  state: ReferenceState,
): void {
  if (moduleSymbol !== undefined) {
    escapeSymbols({ symbols: state.checker.getExportsOfModule(moduleSymbol), state });
  }
}
