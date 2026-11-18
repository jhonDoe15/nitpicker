import type { JavaResolver, TypeDeclaration } from '../proxies/declaration-types.mts';

export type ConstrainedSource = {
  readonly text: string;
  readonly types: TypeDeclaration[];
  readonly resolve: JavaResolver;
};

export type TypeIndexInput = {
  readonly projectRoot: string;
  readonly roots: readonly string[];
  readonly readText: (file: string) => string | undefined;
};

export type TypeIndex = TypeIndexInput & {
  files: Map<string, string[]> | undefined;
  readonly sources: Map<string, ConstrainedSource | undefined>;
  readonly customs: Map<string, boolean>;
};

export type FoundType = { readonly source: ConstrainedSource; readonly type: TypeDeclaration };

export type QueueItem = {
  readonly source: ConstrainedSource;
  readonly name: string;
  readonly root: boolean;
};

export type StepResult = {
  readonly constrained: boolean;
  readonly unresolved: boolean;
  readonly next: QueueItem[];
};

export type RelatedNames = { readonly region: string; readonly names: string[] };

export type BodyLocation = { readonly line: number; readonly column: number | undefined };
