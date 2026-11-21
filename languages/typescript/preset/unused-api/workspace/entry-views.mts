import { depthFirst as untypedDepthFirst } from '../../../../../shared/traversal.mts';

export const depthFirst: (
  root: unknown,
  children: (node: unknown) => unknown[],
) => Iterable<unknown> = untypedDepthFirst;
