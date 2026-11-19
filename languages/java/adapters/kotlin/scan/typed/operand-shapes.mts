import type { Literal } from './scan-shapes.mts';

export type RawToken = {
  kind: string;
  text: string;
  start: number;
  end: number;
  literal?: Literal;
};

export type Token = RawToken & { newline: boolean };

export type Item = { token: number; close: number | undefined };

export type Compound = { operator: string; target: ExpressionRange };

export type ExpressionRange = {
  items: Item[];
  after: Compound | undefined;
  group?: number | undefined;
};

export type Group = {
  from: number;
  to: number;
  opener: string | undefined;
  open?: number | undefined;
};

export type Leaf = {
  operator?: undefined;
  items: Item[];
  type: true | undefined;
  first: number;
  last: number;
  parent?: Tree | undefined;
};

export type Node = {
  operator: string;
  left: Tree;
  right: Tree;
  first: number;
  last: number;
  infix: number | undefined;
  parent?: Tree | undefined;
};

export type Tree = Leaf | Node;

export type CompoundPair = { operator: string; target: Tree; value: Tree };

export type Forest = {
  tokens: Token[];
  roots: Tree[];
  byGroup: Map<number, Tree>;
  compounds: CompoundPair[];
  infixCalls: Set<number>;
};

export type TokenState = { tokens: Token[]; items: Item[] };
