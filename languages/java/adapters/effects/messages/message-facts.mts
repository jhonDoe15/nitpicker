type Method = { readonly method: string };
type CallPath = { readonly path: readonly string[] };
type Held = { readonly scope: string; readonly holder: string };

export type LoopIoFact = Method &
  CallPath & {
    readonly kind: string;
    readonly form?: string | undefined;
    readonly store?: string | undefined;
  };
export type AccumulatorFact = Method & { readonly variable: string; readonly form: string };
export type LazyRelationFact = Method & {
  readonly entity: string;
  readonly relation: string;
  readonly origin: string;
};
export type HeldCallFact = Method & CallPath & Held;
export type RetryWriteFact = HeldCallFact & { readonly write: string };
export type DualWriteFact = Method &
  CallPath & { readonly form: string; readonly write: readonly string[] };
export type GraphqlFact = Method & CallPath & { readonly framework: string; readonly kind: string };
export type ReactiveFact = Method & CallPath & { readonly kind: string; readonly limited: boolean };
export type RowsChangedFact = Method & {
  readonly form: string;
  readonly origin: string;
  readonly entity: string;
};
export type OneColumnFact = Method & {
  readonly entity: string;
  readonly property: string;
  readonly origin: string;
};
export type ExistenceFact = Method & { readonly form: string; readonly origin: string };
export type StaleRetryFact = Method & {
  readonly scope: string;
  readonly object: string;
  readonly write: string;
};
export type AsyncBlockingFact = Method & CallPath & { readonly wrapper: string };
export type AsyncTwinFact = Method & { readonly async: string; readonly sync: string };
export type SoftDeleteFact = {
  readonly entity: string;
  readonly column: string;
  readonly read: string;
  readonly filtered: number;
  readonly total: number;
};
export type InMemoryFact = {
  readonly entity: string;
  readonly flag: string;
  readonly source: string;
  readonly guarded: number;
  readonly units: number;
};
export type HandlerAuthFact = {
  readonly shape: string;
  readonly declared: number;
  readonly total: number;
};
export type JobLoopFact = Method & CallPath & { readonly job: string; readonly kind: string };
export type CheckThenWriteFact = Method & { readonly read: string; readonly write: string };
