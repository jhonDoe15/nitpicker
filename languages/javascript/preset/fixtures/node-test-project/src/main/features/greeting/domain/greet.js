/**
 * @typedef {{ readonly kind: 'greeted'; readonly text: string } | { readonly kind: 'empty-name' }} GreetResult
 */

/**
 * @param {string} name
 * @returns {GreetResult}
 */
export function greet(name) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { kind: 'empty-name' };
  }
  return { kind: 'greeted', text: `Hello, ${trimmed}!` };
}

/**
 * @param {readonly string[]} names
 * @returns {number}
 */
export function totalLength(names) {
  return names.reduce((sum, name) => sum + name.length, 0);
}
