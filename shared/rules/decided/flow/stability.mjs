import { nodesOf } from '../../../near-duplicates/tree/nodes.mjs';
import { namesOf, writtenNames } from '../facts.mjs';

const DECLARING = new Set(['parameter', 'declare', 'foreach']);

function changeableNames(tree) {
  const lambdaWrites = nodesOf(tree)
    .filter((node) => node.kind === 'lambda')
    .flatMap((lambda) => nodesOf(lambda).flatMap((node) => writtenNames(node)));
  const addressed = nodesOf(tree)
    .filter((node) => node.kind === 'name' && node.addressTaken === true)
    .map(({ value }) => value);
  return new Set([...lambdaWrites, ...addressed]);
}

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
  const changeable = changeableNames(tree);
  return new Set(
    [...bound].filter((name) => (writes.get(name) ?? 0) <= 1 && !changeable.has(name)),
  );
}

export function declaredNames(root) {
  return new Set(
    nodesOf(root)
      .filter((node) => DECLARING.has(node.kind) && node.children[1] !== undefined)
      .flatMap((node) => [...namesOf(node.children[1])]),
  );
}
