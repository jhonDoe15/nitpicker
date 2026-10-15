import { chainOf } from '../../../../../../shared/traversal.mjs';

export { chainOf };

export function ancestorsOf(node) {
  return chainOf(node.parent, (current) => current.parent);
}

export function scopeChain(scope) {
  return chainOf(scope, (current) => current.upper);
}

export function variableNamed(sourceCode, identifier) {
  return scopeChain(sourceCode.getScope(identifier))
    .map((scope) => scope.set.get(identifier.name))
    .find((variable) => variable !== undefined);
}
