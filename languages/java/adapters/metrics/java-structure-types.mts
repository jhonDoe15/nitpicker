export type CodeKind = 'source' | 'test';

export type CodeEntry = {
  readonly path: string;
  readonly packagePath: string;
  readonly kind: CodeKind;
};

export type ProjectManifest = {
  readonly sourceRoots?: readonly string[];
  readonly testSourceRoots?: readonly string[];
  readonly kotlinSourceRoots?: readonly string[];
  readonly kotlinTestSourceRoots?: readonly string[];
};

export type MethodEntry = {
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly [field: string]: unknown;
};

export type SourceCache = Map<string, string[]>;

type FilePolicy = {
  readonly exclude?: unknown;
  readonly baselineRoot?: string | undefined;
  readonly thresholds?: unknown;
  readonly exceptions?: unknown;
  readonly conventions?: unknown;
};

export type FileLimitOptions = {
  readonly manifest: ProjectManifest;
  readonly kotlin: boolean;
  readonly policy?: FilePolicy;
};
