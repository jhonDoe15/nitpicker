import type { KotlinFile } from './kotlin-fact-types.mts';
import type { CallerGap } from '../main/unused-options/unused-option-types.mts';

export type ReviewManifest = {
  sourceRoots?: string[];
  testSourceRoots?: string[];
  kotlinSourceRoots?: string[];
  kotlinTestSourceRoots?: string[];
  projectDependencies?: string[];
  kotlinCallerGaps?: CallerGap[];
  kotlinAllOpen?:
    { annotations?: string[] | undefined; presets?: string[] | undefined } | undefined;
  spring?: unknown;
  [field: string]: unknown;
};

export type ReviewModule = {
  reportRoot: string;
  manifest?: ReviewManifest | undefined;
  path?: string | undefined;
  [field: string]: unknown;
};

export type KotlinFacts = {
  files: KotlinFile[];
  skipped: { file: string; test: boolean }[];
};

export type FactsModule = {
  reportRoot: string;
  path: string | undefined;
  manifest: ReviewManifest;
  facts: KotlinFacts;
};

export type FactsView = {
  modules: FactsModule[];
  facts: Map<string, KotlinFacts>;
  files: KotlinFile[];
  mentionedInJava: (name: string) => boolean;
  memo: <Value>(
    key: string,
    compute: () => Value,
    accepts: (value: unknown) => value is Value,
  ) => Value;
};

export type ViewContext = {
  reportRoot: string;
  projectRoot: string;
  manifest: ReviewManifest;
  modules?: ReviewModule[] | undefined;
};

export type ReviewContext = ViewContext & {
  buildViews?: ((context: ViewContext) => FactsView) | undefined;
  assertionHelpers?: string[] | undefined;
  environment?: Record<string, string | undefined> | undefined;
  [field: string]: unknown;
};
