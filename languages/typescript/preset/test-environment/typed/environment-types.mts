export type EnvironmentScope = {
  readonly files: readonly string[];
  readonly ignores?: readonly string[];
  readonly environment: string | undefined;
  readonly setupFiles?: readonly string[];
};

export type Environments = {
  readonly environment: string | undefined;
  readonly scopes: readonly EnvironmentScope[];
  readonly aliases?: readonly { readonly find: string; readonly replacement: string }[];
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
