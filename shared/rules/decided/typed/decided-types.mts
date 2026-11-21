import type { SolverBudget } from '../../../logic/typed/solver-types.mts';
import type { HelperScope, HelperTable } from '../../../near-duplicates/proof/inline.mts';
import type { NearUnit, TreeNode } from '../../../near-duplicates/tree/tree-types.mts';
import type { Memo } from './memo.mts';
import type { Term, Verdict } from '../../../logic/typed/term-types.mts';

export type FlowNode = TreeNode & { readonly equal?: true; readonly viaHelper?: true };

export type Fact = {
  readonly term: Term;
  readonly names: ReadonlySet<string>;
  readonly readsMembers: boolean;
  readonly reason: string;
  readonly assertion?: true;
};

export type Effects = {
  readonly writes: Set<string>;
  memberWrite: boolean;
  call: boolean;
  opaque: boolean;
};

export type FlowScope = {
  readonly integers: ReadonlySet<string>;
  readonly looseBooleans: boolean;
  readonly unbounded: boolean;
  readonly kotlin: boolean;
  readonly references: boolean;
  readonly shadowed: ReadonlySet<string>;
  readonly go: boolean;
  readonly remainders: boolean;
  readonly types: ReadonlyMap<string, string>;
  readonly enums: ReadonlySet<string>;
};

export type Flow = {
  readonly scope: FlowScope;
  readonly mutable: ReadonlySet<string>;
  readonly effects: Memo<FlowNode, Effects>;
  readonly views: Memo<TreeNode, Term>;
  readonly stable: ReadonlySet<string>;
  readonly seen: WeakSet<FlowNode>;
};

export type Check = {
  readonly condition?: FlowNode;
  readonly expression?: FlowNode;
  readonly facts: readonly Fact[];
};

export type FlowChild = {
  readonly statements: readonly FlowNode[];
  readonly facts: readonly Fact[];
};

export type FlowStep = {
  readonly checks: Check[];
  readonly children: FlowChild[];
  readonly after: readonly Fact[];
};

export type Site = {
  readonly node: FlowNode;
  readonly extra: readonly Fact[];
  readonly earlier?: readonly FlowNode[];
};

export type Slip = { readonly node: FlowNode; readonly subject: string; readonly fix: string };

export type Found = {
  readonly node: FlowNode;
  readonly verdict: Verdict;
  readonly part: string;
  readonly reason: string;
};

export type Scan = {
  readonly scope: FlowScope;
  readonly flow: Flow;
  readonly unitName: string;
  readonly found: Found[];
  readonly slips: Slip[];
  readonly probed: Memo<FlowNode, true>;
  readonly checked: Set<FlowNode>;
  readonly coerced: Set<FlowNode>;
  readonly slipsOnly: boolean;
  readonly solver: SolverBudget;
  readonly parameters: ReadonlySet<string>;
};

type UnitImports = {
  readonly names: readonly string[];
  readonly stars: readonly string[];
  readonly classes: readonly string[];
};

export type DecidedUnit = NearUnit & { readonly imports?: UnitImports | undefined };

export type Resolver = {
  readonly imports: UnitImports;
  readonly classes: ReadonlySet<string>;
  readonly kotlin: boolean;
};

export type ModelScope = {
  readonly types: ReadonlyMap<string, string>;
  readonly getters: ReadonlySet<string>;
  readonly owner: string | undefined;
  readonly python: boolean;
  readonly kotlin: boolean;
  readonly go: boolean;
  readonly resolver: Resolver | undefined;
};

export type DecidedOptions = {
  readonly looseBooleans: boolean;
  readonly unbounded: boolean;
  readonly kotlin: boolean;
  readonly references: boolean;
  readonly defined?: Iterable<string>;
  readonly go: boolean;
  readonly remainders: boolean;
  readonly unitName?: string;
  readonly slipsOnly: boolean;
  readonly solver?: SolverBudget;
};

export type RuleContext = {
  readonly analyzerName: string;
  readonly isExcepted: (rule: string, file: string) => boolean;
};

export type PredicateScope = HelperScope & { readonly shadowed: ReadonlySet<string> };

export type SharedTables = {
  readonly getters: ReadonlySet<string>;
  readonly helpers: HelperTable;
  readonly defined: ReadonlySet<string>;
  readonly classes: ReadonlySet<string>;
};

export type SlipCandidate =
  | {
      readonly kind: 'difference';
      readonly node: FlowNode;
      readonly difference: FlowNode;
      readonly operator: string;
    }
  | {
      readonly kind: 'remainder';
      readonly node: FlowNode;
      readonly dividend: FlowNode;
      readonly remainder: FlowNode;
    }
  | {
      readonly kind: 'absolute';
      readonly node: FlowNode;
      readonly argument: FlowNode;
      readonly use: string;
    }
  | { readonly kind: 'comparer'; readonly node: FlowNode; readonly difference: FlowNode };
