export type SnapshotRoots = { readonly configRoot: string; readonly projectRoot: string };

export type IgnoreEntry = { readonly pattern: string; readonly codes: string[] };

export type LintSettings = {
  readonly enabled: Set<string>;
  readonly perFileIgnores: IgnoreEntry[];
};

export type RuffLayer = {
  readonly file: string;
  readonly table: Readonly<Record<string, unknown>>;
};

export type RuffLayers = {
  readonly file: string;
  readonly layers?: RuffLayer[];
  readonly unreadable?: string | undefined;
};

export type RuffProject = {
  readonly options: Readonly<Record<string, unknown>>;
  readonly globals: Readonly<Record<string, unknown>>;
  readonly exclude: string[];
  readonly lintExclude: string[];
};
