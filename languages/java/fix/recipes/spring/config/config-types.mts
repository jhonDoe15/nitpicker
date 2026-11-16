import type { FileKind, LineTable, LocateEntry } from '../locate/locate-types.mts';

export type SpringEntry = LocateEntry & { readonly line: number };

export type SpringDocument = {
  readonly path: string;
  readonly main: boolean;
  readonly entries: readonly SpringEntry[];
};

export type ConfigTarget = {
  readonly document: SpringDocument;
  readonly entry: SpringEntry | undefined;
  readonly rule: string;
  readonly path: string;
  readonly documents: readonly SpringDocument[];
};

type Plain = { readonly skip?: undefined };

export type Operation =
  | (Plain & { readonly kind: 'insert' | 'remove' | 'narrow' })
  | (Plain & { readonly kind: 'value'; readonly to: (old: string) => string })
  | (Plain & { readonly kind: 'rename'; readonly from: string; readonly to: string })
  | { readonly kind?: undefined; readonly skip: string };

export type ConfigItem = { readonly target: ConfigTarget; readonly op: Operation };

export type ConfigFile = {
  readonly path: string;
  readonly text: string;
  readonly kind: FileKind;
  readonly table: LineTable;
};
