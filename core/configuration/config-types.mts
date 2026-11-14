import type { Analyzer } from '../../shared/values/analyzers.mts';

export type NitpickerConfig = {
  readonly preset?: string;
  readonly base?: string;
  readonly analyzers?: readonly Analyzer[];
  readonly history?: { readonly coChange?: unknown };
  readonly tools?: { readonly tests?: { readonly runner?: string } };
  readonly python?: object;
  readonly go?: object;
  readonly [field: string]: unknown;
};
