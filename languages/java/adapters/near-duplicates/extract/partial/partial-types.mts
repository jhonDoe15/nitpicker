import type { Node } from 'web-tree-sitter';
import type { NamedValueHole, Pair, Span } from '../../extract-types.mts';

type ValueOutput = {
  readonly kind: 'value';
  readonly where: string;
  readonly name: string;
  readonly type: string;
  readonly prefix: string;
};
type PlainOutput = {
  readonly kind: 'return' | 'none';
  readonly where?: undefined;
  readonly name?: undefined;
  readonly type?: undefined;
  readonly prefix?: undefined;
};
export type Output = ValueOutput | PlainOutput;
export type Analysis =
  | { readonly problem: string; readonly output?: undefined }
  | { readonly problem?: undefined; readonly output: Output };
export type Input = { readonly names: readonly [string, string]; readonly type: string };
export type Side = { readonly method: Node; readonly statements: Node[] };
export type PartialRequest = {
  readonly methods: Pair;
  readonly runs: readonly Span[];
  readonly label: string;
  readonly engineHoles: number;
  readonly root: Node;
  readonly text: string;
  readonly claimed: Set<string>;
};
export type PartialPlan = {
  readonly methods: Pair;
  readonly statements: readonly (readonly Node[])[];
  readonly outputs: readonly Output[];
  readonly inputs: readonly Input[];
  readonly holes: readonly NamedValueHole[];
  readonly name: string;
  readonly text: string;
  readonly isStatic: boolean;
};
