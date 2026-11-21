import { foldTerm } from '../terms.mts';
import type { NamedTest, Term } from '../typed/term-types.mts';

function helpersIn(root: Term): NamedTest[] {
  return foldTerm<NamedTest[]>(root, (node, children) => [
    ...(node.helper === undefined ? [] : [node.helper]),
    ...children.flat(),
  ]);
}

export function helperNote(terms: readonly Term[]): string {
  const helpers = terms.flatMap((root) => helpersIn(root));
  const seen = new Set<string>();
  const named = helpers.filter(({ name }) => {
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
  return named.map(({ name, text }) => `, and \`${name}\` tests \`${text}\``).join('');
}
