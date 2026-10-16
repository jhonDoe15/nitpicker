export function staticKeyName(key, computed = false) {
  if (computed) {
    return undefined;
  }
  if (key.type === 'Identifier') {
    return key.name;
  }
  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined;
}
