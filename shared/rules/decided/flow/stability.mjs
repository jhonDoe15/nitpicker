import { nodesOf } from '../../../near-duplicates/tree/nodes.mjs';
import { namesOf, writtenNames } from '../facts.mjs';

const DECLARING = new Set(['parameter', 'declare', 'foreach']);

export function stableNames(tree) {
  const writes = new Map();
  for (const node of nodesOf(tree)) {
    for (const name of writtenNames(node)) {
      writes.set(name, (writes.get(name) ?? 0) + 1);
    }
  }
  const bound = new Set(
    nodesOf(tree)
      .filter((node) => node.kind === 'name' && node.binding === 'bound')
      .map(({ value }) => value),
  );
  return new Set([...bound].filter((name) => (writes.get(name) ?? 0) <= 1));
}

export function declaredNames(root) {
  return new Set(
    nodesOf(root)
      .filter((node) => DECLARING.has(node.kind) && node.children[1] !== undefined)
      .flatMap((node) => [...namesOf(node.children[1])]),
  );
}

export function declaredTypes(tree) {
  const types = new Map();
  const conflicting = new Set();
  for (const node of nodesOf(tree)) {
    const [type, target] = DECLARING.has(node.kind) ? node.children : [];
    if (target?.kind !== 'name') {
      continue;
    }
    const text = type?.kind === 'type' ? type.value : undefined;
    if (types.has(target.value) && types.get(target.value) !== text) {
      conflicting.add(target.value);
    }
    types.set(target.value, text);
  }
  for (const name of conflicting) {
    types.delete(name);
  }
  return new Map([...types].filter(([, text]) => text !== undefined));
}
