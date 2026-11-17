export type Line = {
  readonly start: number;
  readonly end: number;
  readonly next: number;
  readonly text: string;
};

export type LineTable = readonly Line[];

export type Range = { readonly start: number; readonly end: number };

export type Span = Range & { readonly quote: string; readonly flow?: true };

export type LocateEntry = {
  readonly key: string;
  readonly value: string;
  readonly list: boolean;
};

export type Located = {
  readonly first: number;
  readonly last: number;
  readonly key: Range | undefined;
  readonly value: Span;
};

export type Insertion = { readonly start: number; readonly end: number; readonly text: string };

export type FileKind = 'properties' | 'yaml';
