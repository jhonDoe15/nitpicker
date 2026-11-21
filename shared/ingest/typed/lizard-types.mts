import type { OccurrenceCounter } from '../../rules/finding-parts.mts';
import type { SourceRange } from './report-types.mts';

export type CrapRow = {
  readonly ccn: number;
  readonly file: string;
  readonly name?: string | undefined;
  readonly longName?: string | undefined;
  readonly start: number;
  readonly end: number;
  readonly numberedAmongSameSource?: unknown;
  readonly signature?: string | undefined;
};

export type CrapRowOptions = {
  readonly tool?: string | undefined;
  readonly limit?: number | undefined;
  readonly root?: string | undefined;
  readonly unknownMessage?: string | undefined;
  readonly sourceText?: ((range: SourceRange) => string | undefined) | undefined;
};

export type CrapResolution = {
  readonly coverage?: number | undefined;
  readonly name?: string | undefined;
};

export type CrapState<Row extends CrapRow> = {
  readonly options: CrapRowOptions;
  readonly limit: number;
  readonly resolve: (fn: Row, filePath: string) => CrapResolution;
  readonly counters: Map<string, (identity: string) => string>;
  readonly sameSourceByFile: Map<string, OccurrenceCounter>;
};

export type CsvState = { fields: string[]; current: string; quoted: boolean };

export type CsvToken = { readonly char: string; readonly next: string | undefined };

export type CsvCharacters = { next(): unknown };

export type SameSourceKey = {
  readonly name: string;
  readonly sourceHash: string | undefined;
  readonly over: boolean;
};
