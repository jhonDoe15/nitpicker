import type { Bounds, Inputs, NormalizedContracts, Status } from './contract-types.mts';
import type { CallExpr, FlowModel, LitValue, Loc, Primitive } from './syntax-types.mts';

export type Guard = {
  readonly text: string;
  readonly value: boolean;
  readonly line: number;
  readonly column: number;
  readonly seq: number;
};

export type TraceEvent = {
  readonly callee: string;
  readonly entity: string;
  readonly outcome: string;
  readonly result: 'success' | 'failure' | 'ambiguous' | 'unknown';
  readonly to?: string;
  readonly event?: string;
  readonly line: number;
  readonly column: number;
  readonly seq: number;
};

export type Reason = {
  readonly reason: string;
  readonly line: number;
  readonly column: number;
  readonly detail: string;
};

export type Witness = { readonly guards: readonly Guard[]; readonly events: readonly TraceEvent[] };

export type Violation = {
  readonly signature: string;
  readonly observation: string;
  readonly site: string;
  readonly contract: string;
  readonly kind: 'prerequisite' | 'transition' | 'unmodelled';
  readonly requires?: string;
  readonly from?: Primitive;
  readonly to?: string | undefined;
  readonly detail?: string;
  readonly callee: string;
  readonly entity: string;
  readonly line: number;
  readonly column: number;
  readonly certainty: 'definite' | 'possible';
  readonly witness: Witness;
};

export type ReportedViolation = Violation & { readonly path: string };

export type AnalysisPath = {
  readonly id: string;
  readonly completion: 'return' | 'throw';
  readonly value: string;
  readonly guards: readonly Guard[];
  readonly events: readonly TraceEvent[];
  readonly violations: readonly string[];
  readonly partial: readonly Reason[];
};

export type AnalysisResult = {
  readonly status: Status;
  readonly reasons: readonly Reason[];
  readonly violations: readonly ReportedViolation[];
  readonly paths: readonly AnalysisPath[];
  readonly stats: {
    readonly paths: number;
    readonly states: number;
    readonly maxStates: number;
  };
};

export type Analysis = { readonly model: FlowModel; readonly result: AnalysisResult };

export type Value =
  | { readonly t: 'undef' }
  | { readonly t: 'lit'; readonly v: LitValue }
  | { readonly t: 'input'; readonly path: string; readonly effects?: true }
  | { readonly t: 'atom'; readonly key: string; readonly domain?: readonly Primitive[] }
  | { readonly t: 'opaque'; readonly label: string }
  | {
      readonly t: 'obj';
      readonly id: string;
      readonly epoch: number;
      readonly fields: readonly (readonly [string, Value])[];
    }
  | { readonly t: 'tmpl'; readonly parts: readonly (string | Value)[] };

export type AtomValue = Extract<Value, { readonly t: 'atom' }>;
export type PrimitiveValue = Extract<Value, { readonly t: 'lit' | 'undef' }>;
export type ObjectLikeValue = Extract<Value, { readonly t: 'input' | 'opaque' | 'obj' }>;

export type Fact = {
  readonly eq?: { readonly v: Primitive };
  readonly truthy?: boolean;
  readonly neq: readonly Primitive[];
};

export type FactPatch = {
  readonly eq?: { readonly v: Primitive };
  readonly truthy?: boolean;
  readonly neq?: readonly Primitive[];
};

export type Frame = {
  readonly fn: string;
  readonly args: readonly Value[];
  readonly sites?: readonly string[];
};

export type RunContext = {
  readonly model: FlowModel;
  readonly contracts: NormalizedContracts;
  readonly inputs: Inputs;
  readonly bounds: Bounds;
  readonly budget: { created: number; exhausted: boolean };
  readonly callHelper: (state: State, call: HelperCall) => Flow[];
};

export type State = {
  readonly run: RunContext;
  frame: Frame;
  stack: string[];
  env: Map<string, Value>;
  facts: Map<string, Fact>;
  fields: Map<string, Value>;
  entities: Map<string, { readonly states: readonly Primitive[] }>;
  events: TraceEvent[];
  guards: Guard[];
  violations: Violation[];
  partial: Reason[];
  epoch: number;
  calls: number;
  mutated: boolean;
};

export type Flow<V = Value> =
  { readonly state: State; readonly value: V } | { readonly state: State; readonly thrown: Value };

export type HelperCall = {
  readonly name: string;
  readonly args: readonly Value[];
  readonly expr: CallExpr;
};

export type Completion = {
  readonly state: State;
  readonly completion: 'normal' | 'return' | 'throw';
  readonly value: Value;
};

export type Fork<T> = [State, T][];

export type EffectCall = {
  readonly callee: string;
  readonly loc: Loc;
  readonly site: string;
  readonly args: readonly Value[];
  readonly entity: string;
  readonly event: string | undefined;
  readonly to: string | undefined;
};
