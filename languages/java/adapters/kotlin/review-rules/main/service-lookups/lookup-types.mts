import type { Argument as ArgumentFact } from '../../spring/typed/spring-facts.mts';

export type LookupScope = {
  k: string;
  name?: string;
  qualified?: string;
  annotations?: string[];
  supers?: string[];
  topLevel?: true;
  object?: true;
  frameId?: number;
  host?: string;
  receiver?: string;
  parameters?: { type?: string; vararg: boolean }[];
};

export type LookupFact = {
  line: number;
  name: string;
  qualifier?: string;
  positional?: number;
  lambda: boolean;
  arguments?: ArgumentFact[];
  scopes?: LookupScope[];
  default: boolean;
  reference: boolean;
};

export type TypedFact = {
  name: string;
  type: string;
  member: boolean;
  scope?: number;
};

export type Hierarchy = { roots: string[]; project: Set<string> };
export type Hierarchies = { modules: Hierarchy; roots: Hierarchy };

export type FunctionApi = { name: string; owners: string[]; compose?: true };
export type StaticApi = { owner: string; names: string[]; koin?: true };
export type ReceiverApi = { receivers: string[]; names: string[]; koin?: true };

export type Enclosing = { fun?: LookupScope | undefined; owner?: LookupScope | undefined };
export type Framed = { fun: LookupScope; owner?: LookupScope | undefined };
export type LookupLabel = { label: string; koin: boolean; compose: boolean };
export type Found = { lookup: LookupFact; found: LookupLabel };
