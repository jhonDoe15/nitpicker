import type { FactImport } from '../../facts/typed/fact-types.mts';

export type Origin = { readonly path: string; readonly name: string };

export type MergedDefinition = {
  readonly key: string;
  readonly exported: boolean;
  readonly overloads: boolean;
  readonly line: number;
};

export type ModuleEntry = {
  readonly definitions: Map<string, MergedDefinition>;
  readonly exports: Map<string, string>;
  readonly reexports: FactImport[];
};

export type ModuleIndex = ReadonlyMap<string, ModuleEntry>;

export type CollisionContext = {
  readonly analyzerName: string;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
  readonly fixFor?: ((importer: string) => string | undefined) | undefined;
};

export type Environment = CollisionContext & {
  readonly index: ModuleIndex;
  readonly importsByFile: ReadonlyMap<string, FactImport[]>;
};

export type Collision = {
  readonly name: string;
  readonly importer: string;
  readonly origins: readonly Origin[];
};

export type CollisionEntry = {
  readonly origin: Origin;
  readonly name: string;
  readonly importer: string;
  readonly others: readonly string[];
};
