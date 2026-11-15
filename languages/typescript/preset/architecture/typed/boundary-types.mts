import type TypeScript from 'typescript';

export type Role = {
  readonly name: string;
  readonly modules: readonly string[];
  readonly forbiddenDependencies: readonly string[];
  readonly forbiddenCalls: readonly string[];
};

export type Configuration = {
  readonly roles: readonly Role[];
  readonly exclude: readonly string[];
};

export type BoundaryFinding = {
  readonly source: string;
  readonly role: string;
  readonly rule: string;
  readonly target: string;
  readonly line: number;
  readonly column: number;
};

export type Context = {
  readonly file: TypeScript.SourceFile;
  readonly filename: string;
  readonly role: Role;
  readonly findings: BoundaryFinding[];
};

export type Layout = {
  readonly sourceRoot: string;
  readonly isSourceFile: (file: string) => boolean;
  readonly isExcluded: (file: string) => boolean;
};
