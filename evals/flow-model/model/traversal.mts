import {
  chainOf as untypedChainOf,
  depthFirst as untypedDepthFirst,
} from '../../../shared/traversal.mjs';

export function depthFirst<T>(root: T, children: (node: T) => readonly T[]): T[] {
  const nodes: T[] = [...untypedDepthFirst(root, children)];
  return nodes;
}

export function chainOf<T>(start: T | undefined, next: (node: T) => T | undefined): T[] {
  const nodes: T[] = untypedChainOf(start, next);
  return nodes;
}
