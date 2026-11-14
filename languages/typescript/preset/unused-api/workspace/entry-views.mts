import { depthFirst as untypedDepthFirst } from '../../../../../shared/traversal.mjs';

export const depthFirst: (
  root: unknown,
  children: (node: unknown) => unknown[],
) => Iterable<unknown> = untypedDepthFirst;
