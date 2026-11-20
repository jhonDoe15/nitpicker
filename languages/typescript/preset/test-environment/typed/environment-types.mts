export type EnvironmentScope = {
  readonly files: readonly string[];
  readonly ignores?: readonly string[];
  readonly environment: string | undefined;
  readonly setupFiles?: readonly string[];
};

export type EnvironmentAlias = {
  readonly find: string | { readonly pattern: string; readonly flags: string };
  readonly replacement: string;
};

export type Environments = {
  readonly environment: string | undefined;
  readonly scopes: readonly EnvironmentScope[];
  readonly aliases?: readonly EnvironmentAlias[];
  readonly setupFiles?: readonly string[];
  readonly globalDom?: string;
  readonly notice?: { readonly path: string; readonly message: string };
};

export type EnvironmentOptions = {
  readonly projectRoot: string;
  readonly liveProjectRoot?: string | undefined;
  readonly runnerProjectRoot?: string | undefined;
  readonly timeoutMs?: number | undefined;
};

export type TestFiles = {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
};

export type EnvironmentRead = {
  readonly environments: Environments;
  readonly testFiles: TestFiles;
  readonly retry?: unknown;
  readonly projectRetries?: readonly { readonly name: unknown; readonly retry: unknown }[];
};

export type ConfigOutcome = { readonly result?: unknown; readonly failure?: string };

export type TestCommandView = {
  readonly launcher?: string | undefined;
  readonly arguments_: readonly string[];
  readonly nodeArguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
};

export type ReadRequest = {
  readonly configFile: string;
  readonly projectRoot: string;
  readonly resolveRoots: readonly string[];
};
