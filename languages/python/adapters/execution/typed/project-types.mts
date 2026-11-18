export type DjangoScript = {
  readonly script: string;
  readonly directory: string;
  readonly text: string;
};

export type FileSource = {
  paths(): readonly string[];
  readMany(paths: readonly string[]): ReadonlyMap<string, string>;
};

export type TypeCheckerHints = {
  readonly configured: RegExp;
  readonly configFiles: readonly string[];
  readonly declared: RegExp;
};

export type FileEntry = readonly [string, string];

export type PytestProbe = {
  readonly version: string;
  readonly coverage: boolean;
  readonly xdist: boolean;
  readonly rerunfailures: boolean;
  readonly django: boolean;
  readonly retry: boolean;
};
