import type { JavaFinding } from '../typed/java-values.mts';

export type DomainFinding = JavaFinding & { readonly identity: string };

export type ClassEntry = {
  readonly name: string;
  readonly file: string;
  readonly packageName: string;
  readonly qualifier: string;
};

export type ClassEdge = { readonly source: ClassEntry; readonly target: ClassEntry };

export type LibraryEdge = { readonly source: ClassEntry; readonly library: string };

export type ClassGraph = {
  readonly classes: readonly ClassEntry[];
  readonly edges: readonly ClassEdge[];
  readonly libraryEdges: readonly LibraryEdge[];
};

export type LibraryHit = { readonly library: string; readonly rule: string };

export type Reach = {
  readonly hits: Map<ClassEntry, LibraryHit>;
  readonly next: Map<ClassEntry, ClassEntry | undefined>;
};

export type LibraryUse = {
  readonly source: ClassEntry;
  readonly library: string;
  readonly shown: string;
  readonly rule: string;
};

export type Concern = {
  readonly rule: string;
  readonly classes: readonly string[];
  readonly packages: readonly string[];
  readonly reach?: true;
};

export type ClassProject = {
  readonly reportRoot: string;
  readonly qualifier: string;
  readonly sourceRoots: readonly string[];
  readonly kotlinSourceRoots?: readonly string[] | undefined;
  readonly filePrefix?: string | undefined;
};

export type ClassResolver = {
  readonly isProjectClass: (name: string) => boolean;
  readonly resolve: (qualifier: string, name: string) => ClassEntry | undefined;
};

export type ResolvedGraph = ClassGraph & { readonly resolve: ClassResolver['resolve'] };
