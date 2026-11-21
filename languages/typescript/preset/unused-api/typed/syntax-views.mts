import { depthFirst as untypedDepthFirst } from '../../../../../shared/traversal.mts';

export const depthFirst: <T>(root: T, children: (node: T) => readonly T[]) => Iterable<T> =
  untypedDepthFirst;
