import { scopeChain } from '../../rules/analysis/ancestry.mjs';

export function visibleVariable(sourceCode, node, name) {
  return scopeChain(sourceCode.getScope(node))
    .map((scope) => scope.set.get(name))
    .find((variable) => variable !== undefined);
}

export function isDeclared(sourceCode, node, name) {
  return (visibleVariable(sourceCode, node, name)?.defs.length ?? 0) > 0;
}
