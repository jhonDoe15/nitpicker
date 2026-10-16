import ts from 'typescript';
import { chainOf } from '../../../../../shared/traversal.mjs';
import { targetOf, targetOfSymbol } from '../syntax/resolve.mjs';

export function leftmost(node) {
  return chainOf(node, (current) =>
    ts.isPropertyAccessExpression(current) ? current.expression : undefined,
  ).at(-1);
}

/** Whether a name or `a.b` access may refer to a target, by name alone (no checker call). */
export function mayBeTarget(node, state) {
  if (ts.isIdentifier(node)) return state.names.has(node.text);
  if (!ts.isPropertyAccessExpression(node)) return false;
  const root = leftmost(node);
  return (
    state.names.has(node.name.text) || (ts.isIdentifier(root) && state.namespaces.has(root.text))
  );
}

/** The component a reference (`X`, `ui.X`) names, when it is one. */
export function referencedComponent(node, state) {
  const isReference =
    node !== undefined && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node));
  const target = isReference && mayBeTarget(node, state) ? targetOf(state, node) : undefined;
  return target?.kind === 'component' ? target : undefined;
}

export function consume(node, state) {
  state.consumed.add(node);
  if (ts.isPropertyAccessExpression(node)) state.consumed.add(node.name);
}

/** How the current file uses a target: a call that passes some members, or an escape. */
export function record({ target, state, kind, passes }) {
  target.refs.push({ kind, passes, role: state.file.role, packageDir: state.file.packageDir });
}

function escapeSymbols({ symbols, state }) {
  for (const symbol of symbols) {
    const resolved =
      symbol.flags & ts.SymbolFlags.Alias ? state.checker.getAliasedSymbol(symbol) : symbol;
    const target = targetOfSymbol(state.registry, resolved);
    if (target !== undefined) record({ target, state, kind: 'escape' });
  }
}

/** Every export of a module escapes: it is loaded at run time or used as a namespace value. */
export function escapeModule(moduleSymbol, state) {
  if (moduleSymbol !== undefined) {
    escapeSymbols({ symbols: state.checker.getExportsOfModule(moduleSymbol), state });
  }
}
