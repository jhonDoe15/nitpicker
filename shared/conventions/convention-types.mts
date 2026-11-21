import type { ConventionDefinition } from '../values/config-types.mts';

export type Counts = Record<string, number>;

export type Convention = ConventionDefinition & {
  readonly fallback?: unknown;
  readonly valuePattern?: RegExp;
  readonly unit?: string;
  readonly range?: string;
  readonly optionLabels?: Readonly<Record<string, string>>;
  readonly nameOnly?: unknown;
  readonly needsText?: (file: string) => boolean;
  readonly sampleLimit?: number;
  readonly hidden?: unknown;
  readonly minFiles?: number;
  readonly minUnit?: string;
  readonly minVotes?: number;
  readonly strictMajority?: unknown;
  measure?(text: string | undefined, file: string): unknown;
  readonly choose?: (counts: Counts, definition: Convention) => readonly string[];
};

export type ConventionSource = {
  readonly paths: (options?: { readonly unreadable?: true }) => string[];
  readonly readMany: (files: readonly string[]) => ReadonlyMap<string, string | undefined>;
};

export type DetectedEntry = {
  readonly choice: unknown;
  readonly source?: string | undefined;
  readonly counts?: Counts | undefined;
  readonly files?: number | undefined;
  readonly from?: string | undefined;
  readonly overrides?: unknown;
  readonly followsConfig?: unknown;
};
