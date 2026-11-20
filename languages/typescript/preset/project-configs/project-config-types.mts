export type ChildLoad = {
  readonly script: string;
  readonly args: readonly string[];
  readonly name: string;
  readonly projectRoot: string;
  readonly timeoutMs?: number | undefined;
};

export type StrykerConfig = Readonly<Record<string, unknown>>;

export type StrykerMutant = {
  readonly status: string;
  readonly statusReason?: string | undefined;
};

export type SolutionLayout = {
  readonly sourceRoots?: readonly string[];
  readonly testRoots?: readonly string[];
  readonly exclude?: readonly string[];
  readonly javascript: boolean;
  readonly isTestFile?: (file: string) => boolean;
  readonly isSourceFile?: (file: string) => boolean;
  readonly projectCodeFiles?: (projectRoot: string) => readonly string[];
};

export type Coverage = { readonly file: string; readonly tests: number; readonly covered: number };

export type MergedOptions = {
  readonly keptRootDir: string | undefined;
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly typesFrom: string[];
};

export type SolutionChoice = Coverage & MergedOptions;

export type ProjectTsconfig = {
  readonly name: string;
  readonly options: Readonly<Record<string, unknown>>;
};

export type RetryContext = { readonly liveRoot: string; readonly tokens: readonly string[] };

export type RetryRead = {
  readonly file: string;
  readonly files: string[];
  readonly ignored?: readonly unknown[];
  readonly retry?: unknown;
};
