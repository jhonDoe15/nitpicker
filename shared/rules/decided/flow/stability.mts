import { nodesOf } from '../../../near-duplicates/tree/nodes.mts';
import { namesOf, writtenNames } from '../facts.mts';
import type { FlowNode } from '../typed/decided-types.mts';

const DECLARING = new Set(['parameter', 'declare', 'foreach']);

function valueOf({ value }: FlowNode): string[] {
  return value === undefined ? [] : [value];
}

function changeableNames(tree: FlowNode): Set<string> {
  const lambdaWrites = nodesOf(tree)
    .filter((node) => node.kind === 'lambda')
    .flatMap((lambda) => nodesOf(lambda).flatMap((node) => writtenNames(node)));
  const addressed = nodesOf(tree)
    .filter((node) => node.kind === 'name' && node.addressTaken === true)
    .flatMap(valueOf);
  return new Set([...lambdaWrites, ...addressed]);
}

export function stableNames(tree: FlowNode): Set<string> {
  const writes = new Map<string, number>();
  for (const node of nodesOf(tree)) {
    for (const name of writtenNames(node)) {
      writes.set(name, (writes.get(name) ?? 0) + 1);
    }
  }
  const bound = new Set(
    nodesOf(tree)
      .filter((node) => node.kind === 'name' && node.binding === 'bound')
      .flatMap(valueOf),
  );
  const changeable = changeableNames(tree);
  return new Set(
    [...bound].filter((name) => (writes.get(name) ?? 0) <= 1 && !changeable.has(name)),
  );
}

export function declaredNames(root: FlowNode): Set<string> {
  return new Set(
    nodesOf(root).flatMap((node) => {
      const target = node.children[1];
      return DECLARING.has(node.kind) && target !== undefined ? [...namesOf(target)] : [];
    }),
  );
}
