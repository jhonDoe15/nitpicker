import { lineOf as untypedLineOf, scanKotlinSource as untypedScan } from '../kotlin-source.mjs';

export type Located = {
  offset: number;
};

export type Ruled = Located & {
  rule: string;
};

export type Subjected = Ruled & {
  subject: string;
};

export type Messaged = Located & {
  message: string;
};

export type Literal = {
  start: number;
  end: number;
  bodyStart: number;
  text: string;
  template: boolean;
  raw: boolean;
};

type Comment = {
  start: number;
  end: number;
  kind: string;
  text: string;
};

export type Scanned = {
  source: string;
  code: string;
  contextCode: string;
  literals: Literal[];
  comments: Comment[];
  lineStarts: number[];
};

export type Check<Found extends Located> = (scanned: Scanned) => Found[];

export const scanKotlinSource: (source: string) => Scanned = untypedScan;

export const lineOf: (scanned: Scanned, offset: number) => number = untypedLineOf;
