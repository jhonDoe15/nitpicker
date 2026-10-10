export function chainOf(start, next) {
  return start ? [start, ...chainOf(next(start), next)] : [];
}

export function ancestorsOf(node) {
  return chainOf(node.parent, (current) => current.parent);
}

export function scopeChain(scope) {
  return chainOf(scope, (current) => current.upper);
}
