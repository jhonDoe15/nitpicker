import { foldTerm } from '../terms.mjs';

function helpersIn(root) {
  return foldTerm(root, (node, children) => [
    ...(node.helper === undefined ? [] : [node.helper]),
    ...children.flat(),
  ]);
}

/** What to append to a reason when a term was read through same-file helpers: which, and what they test. */
export function helperNote(terms) {
  const helpers = terms.flatMap((root) => helpersIn(root));
  const seen = new Set();
  const named = helpers.filter(({ name }) => !seen.has(name) && seen.add(name));
  return named.map(({ name, text }) => `, and \`${name}\` tests \`${text}\``).join('');
}
