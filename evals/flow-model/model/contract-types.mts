import type { LitValue, Primitive } from './syntax-types.mts';

export type ArgSpec = { readonly arg: number; readonly field?: string };

export type Outcome = {
  readonly name: string;
  readonly result: 'success' | 'failure' | 'ambiguous';
  readonly returns?: LitValue;
};

export type EffectContract = {
  readonly entity: ArgSpec;
  readonly event?: ArgSpec;
  readonly outcomes: readonly Outcome[];
};

export type TransitionContract = {
  readonly id: string;
  readonly effect: string;
  readonly from: ArgSpec;
  readonly to: ArgSpec;
  readonly allowed: readonly (readonly [string, string])[];
};

export type PrerequisiteContract = {
  readonly id: string;
  readonly effect: string;
  readonly event?: string;
  readonly requires: { readonly effect: string; readonly to?: string };
};

export type Contracts = {
  readonly effects?: Readonly<Record<string, EffectContract>>;
  readonly pure?: readonly string[];
  readonly constructs?: readonly string[];
  readonly transitions?: readonly TransitionContract[];
  readonly prerequisites?: readonly PrerequisiteContract[];
};

export type NormalizedContracts = {
  readonly effects: Readonly<Record<string, EffectContract>>;
  readonly pure: readonly string[];
  readonly constructs: readonly string[];
  readonly transitions: readonly TransitionContract[];
  readonly prerequisites: readonly PrerequisiteContract[];
};

export type InputTree = { readonly [key: string]: InputSpec | readonly Primitive[] };
export type InputSpec = Primitive | InputTree;
export type SpecNode = InputSpec | readonly Primitive[];
export type Inputs = InputTree;

export type Bounds = { readonly maxStates: number; readonly maxDepth: number };

export type Status = 'complete' | 'partial';

export type Expectation = {
  readonly status: Status;
  readonly violations: readonly string[];
  readonly reasons: readonly string[];
};

export type OracleChoice = { readonly index: number; readonly count: number };

export type OracleExecution = {
  readonly assignment: Readonly<Record<string, Primitive>>;
  readonly trace: string;
  readonly thrown: string;
  readonly violations: readonly string[];
  readonly uninjected: readonly string[];
  readonly choices: readonly OracleChoice[];
};

export type OracleRun = {
  readonly executions: readonly OracleExecution[];
  readonly exhausted: boolean;
  readonly unsupported?: string;
};

export type OracleOptions = {
  readonly file: string;
  readonly text: string;
  readonly entry: string;
  readonly contracts: Contracts;
  readonly inputs: Inputs;
  readonly limit?: number;
  readonly exploreUnknown?: boolean;
};

export type EntryFunction = (...args: readonly unknown[]) => unknown;
export type RequireModule = (specifier: string) => unknown;
