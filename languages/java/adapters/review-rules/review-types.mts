export type SourceProject = {
  readonly sourceRoots?: readonly string[] | undefined;
  readonly testSourceRoots?: readonly string[] | undefined;
  readonly kotlinSourceRoots?: readonly string[] | undefined;
  readonly kotlinTestSourceRoots?: readonly string[] | undefined;
  readonly kotlinExcludedFiles?: readonly string[] | undefined;
};

export type SourceListing = {
  readonly skipped: ReadonlySet<string> | undefined;
  readonly includeIgnored: boolean;
};

export type StaticImport = { readonly owner: string; readonly name: string };

export type SourceLocation = { readonly line: number; readonly column?: number | undefined };

export type DepthChanges = Readonly<Record<string, number | undefined>>;
