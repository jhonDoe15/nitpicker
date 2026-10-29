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
  return { kind: 'greeted', text: `Hi, ${trimmed}!` };
}

/**
 * @param {GreetResult} result
 * @returns {string}
 */
export function describeResult(result) {
  switch (result.kind) {
    case 'greeted':
      return result.text;
    case 'empty-name':
      return 'No name given';
  }
}
