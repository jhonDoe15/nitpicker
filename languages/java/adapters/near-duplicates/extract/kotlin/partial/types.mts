import type { Run } from './run.mts';

export type Value = {
  readonly name: string;
  readonly type: string;
  readonly keyword: string;
  readonly annotated: boolean;
};
export type Side = {
  readonly run: Run;
  readonly inside: ReadonlySet<string>;
  readonly output?: Value | undefined;
};
export type Pair2 = readonly [Side, Side];
