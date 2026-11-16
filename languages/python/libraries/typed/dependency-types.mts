export type DependencyEntry = {
  readonly name: string;
  readonly normalized: string;
  readonly group: string;
  readonly file: string;
};

export type DependencySource = {
  readonly entries: readonly DependencyEntry[];
  readonly declares: boolean;
};

export type RequirementLines = {
  readonly file: string;
  readonly group: string;
  readonly lines: readonly string[];
};

export type DeclaredDependencies = {
  readonly dependencies: readonly DependencyEntry[];
  readonly runtime: readonly string[];
  readonly development: readonly string[];
  readonly complete: boolean;
  readonly declaresDev: boolean;
  readonly manifest: string;
};

export type TomlModule = {
  readonly parse: (text: string) => unknown;
  readonly stringify: (value: unknown) => string;
};
