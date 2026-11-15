export type JsonNull = Exclude<ReturnType<RegExp['exec']>, RegExpExecArray>;

export type PythonModule = {
  readonly file: string;
  readonly module: string;
  readonly isPackage: boolean;
};

export type OtherModule = {
  readonly file: string;
  readonly module: string;
  readonly kind: string;
  readonly inRoots: boolean;
};

export type ImportStatement = {
  readonly level: number;
  readonly module: string | JsonNull;
  readonly names: readonly string[];
  readonly typeOnly?: true | false;
  readonly exported?: true;
  readonly guarded?: true | false;
  readonly name?: string;
  readonly asname?: string | JsonNull;
  readonly line?: number;
};

export type ImportsByFile = Readonly<Record<string, readonly ImportStatement[]>>;

export type ImportsReport = {
  readonly modules: readonly PythonModule[];
  readonly others?: readonly OtherModule[];
  readonly imports: ImportsByFile;
};

export type ImportEdge = {
  readonly source: string;
  readonly target: string;
  readonly kind: string;
};

export type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path?: string | undefined;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

export type AliasEntry = {
  readonly level?: number;
  readonly module: string | JsonNull;
  readonly name?: string;
  readonly asname?: string | JsonNull;
};

export type ClassEntry = {
  readonly name: string;
  readonly bases: readonly string[];
  readonly kind?: string;
  readonly file?: string;
  readonly [key: string]: unknown;
};

type ClassesOfFile = {
  readonly classes: readonly ClassEntry[];
  readonly imports: readonly AliasEntry[];
};

export type ClassesReport = Readonly<Record<string, ClassesOfFile>>;
