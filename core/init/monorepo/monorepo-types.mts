export type Member = {
  readonly path: string;
  readonly folder: string;
  readonly absolute: string;
  readonly preset: string;
  readonly declared: boolean;
};

export type ProjectEntry = { readonly path: string; readonly preset: string };

export type MonorepoLayout = {
  readonly source: string;
  readonly members: readonly Member[];
  readonly entries: readonly ProjectEntry[];
};

export type MonorepoLayoutOf = (root: string, repository: string) => MonorepoLayout | undefined;
