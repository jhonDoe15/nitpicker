export type KnipCategory = 'exports' | 'types' | 'files';

type KnipEntry = { readonly name: string; readonly line?: number | undefined };

export type KnipItem = {
  readonly file: string;
  readonly category: KnipCategory;
  readonly entry: KnipEntry;
  readonly reexportedBy?: string | undefined;
};

export type KnipReport = {
  readonly issues?: readonly (Partial<Record<KnipCategory, readonly KnipEntry[]>> & {
    readonly file: string;
  })[];
};
