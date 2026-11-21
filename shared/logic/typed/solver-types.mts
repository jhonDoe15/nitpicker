import type { Arith, BitVec, Bool, Context, Model, Solver } from 'z3-solver';
import type { Term } from './term-types.mts';

type Z3Name = 'nitpicker-logic';
export type Z3 = Context<Z3Name>;
export type Z3Bool = Bool<Z3Name>;
export type Z3Arith = Arith<Z3Name>;
export type Z3Vector = BitVec<number, Z3Name>;
export type Z3Model = Model<Z3Name>;
export type Z3Solver = Solver<Z3Name>;
export type Z3Expression = Z3Bool | Z3Arith | Z3Vector;
type Numbers = Z3['Int'] | Z3['Real'];

export type Vector = { readonly bits: number; readonly signed: boolean; readonly expr: Z3Vector };

export type Encoding = {
  readonly z3: Z3;
  readonly sameCalls: boolean;
  readonly integers: boolean;
  readonly numbers: Numbers;
  readonly atoms: Map<string, Z3Expression>;
  readonly literals: Map<string, Z3Arith>;
  readonly unsigned: Set<Z3Expression>;
  readonly divisors: Z3Vector[];
  readonly facts: Z3Bool[];
};

export type Encoded = {
  readonly node: Term;
  readonly integral: boolean;
  readonly vector: Vector | undefined;
  readonly value: Z3Arith;
  readonly notANumber: Z3Bool;
  readonly truth: Z3Bool;
};

export type BoundSpace<Bound> = {
  readonly value: {
    readonly ge: (bound: Bound) => Z3Bool;
    readonly lt: (bound: Bound) => Z3Bool;
  };
  readonly numbers: { readonly val: (value: number) => Bound };
};

type SolverFlags = {
  readonly sameCalls: boolean;
  readonly integers: boolean;
  readonly nonZeroDivisors: boolean;
};

export type DecideOptions = Partial<SolverFlags> & { readonly resourceLimit?: number };

export type SolverBudget = { readonly spend: () => boolean; readonly remaining: () => number };

export type DecisionQuestion = {
  readonly explain: boolean;
  readonly conditions: readonly Term[];
  readonly query: Term;
  readonly options: DecideOptions;
};

export type SolverReply = {
  readonly id: number;
  readonly result?: unknown;
  readonly failure?: unknown;
};

export type DecideSyncOptions = DecideOptions & {
  readonly timeoutMs?: number | undefined;
  readonly budget?: SolverBudget | undefined;
};

export type AnswerStore = {
  readonly find: (id: string) => unknown;
  readonly keep: (id: string, result: unknown) => void;
};
