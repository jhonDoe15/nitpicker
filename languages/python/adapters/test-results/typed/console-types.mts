export type ConsoleEntry = {
  readonly file: string;
  readonly test: string;
  readonly messages: readonly string[];
};

export type ConsoleReport = { readonly entries: readonly ConsoleEntry[] };

export type ConsoleManifest = {
  readonly testRunner?: string | undefined;
  readonly testsRan?: unknown;
};
