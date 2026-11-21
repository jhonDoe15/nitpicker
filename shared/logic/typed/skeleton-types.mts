import type { Term } from './term-types.mts';

export type Leaf = { readonly op: 'leaf'; readonly term: Term; readonly text: string };
export type Negation = { readonly op: 'not'; readonly kid: Skeleton };
export type Chain = { readonly op: 'and' | 'or'; readonly kids: Skeleton[] };
export type Skeleton = Leaf | Negation | Chain;

export type Style = { readonly and: string; readonly or: string; readonly not: string };

export type SkeletonSource<Context> = {
  readonly rootContext: Context;
  readonly children: (context: Context, index: number) => Context;
  readonly text: (term: Term, context: Context) => string;
};

export type Site = { readonly node: Chain; readonly path: number[] };

export type Deletion = {
  readonly kind: 'delete';
  readonly index: number;
  readonly site: Site;
  readonly result: Skeleton;
};

export type Merge = {
  readonly kind: 'merge';
  readonly first: number;
  readonly second: number;
  readonly site: Site;
  readonly result: Skeleton;
};

export type Candidate = (Deletion | Merge) & { readonly order: number; readonly size: number };

export type Guard = {
  readonly leaves: Leaf[];
  readonly pinned: Set<Leaf>;
  readonly throwers: Set<Leaf>;
};
