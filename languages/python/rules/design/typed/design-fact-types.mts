export type CallFact = {
  readonly target: string;
  readonly line: number;
  readonly receiver?: string;
  readonly branch?: unknown;
};
type ParamFact = { readonly name: string; readonly [field: string]: unknown };
type UseFact = { readonly param: number; readonly [field: string]: unknown };
type ModuleFact = { readonly file: string; readonly [field: string]: unknown };
export type DesignEntry = {
  readonly id: string;
  readonly kind: string;
  readonly file: string;
  readonly exported: boolean;
  readonly published?: true;
  readonly supertypes?: unknown;
  readonly calls: readonly CallFact[];
  readonly params: readonly ParamFact[];
  readonly paramUses: readonly UseFact[];
  readonly reads: unknown;
  readonly decisions: unknown;
  readonly ownFields: unknown;
  readonly fields: unknown;
  readonly entry: unknown;
  readonly forward: unknown;
  readonly references: unknown;
  readonly returns: unknown;
  readonly returnsField: unknown;
  readonly line: unknown;
};
export type DesignFacts = {
  readonly types: readonly DesignEntry[];
  readonly callables: readonly DesignEntry[];
  readonly modules: readonly ModuleFact[];
};
export type DesignReport = { readonly error?: string; readonly facts: DesignFacts };
export type DesignOptions = { readonly entryFiles?: readonly string[] };
