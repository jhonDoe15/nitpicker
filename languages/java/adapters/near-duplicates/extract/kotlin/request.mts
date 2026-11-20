import type { Node } from 'web-tree-sitter';
import type { Pair, Span } from '../../extract-types.mts';

export type KotlinRequest = {
  readonly methods: Pair;
  readonly runs: readonly Span[];
  readonly label: string;
  readonly engineHoles: number;
  readonly root: Node;
  readonly text: string;
  readonly claimed: Set<string>;
};
