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

export type Comment = {
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

export type Range = { from: number; to: number };

export type StackEntry = {
  mode: 'code' | 'raw' | 'string';
  start: number;
  bodyStart: number;
  template: boolean;
  expressions: Range[];
  depth: number;
  expressionStart: number;
};

export type ScanState = {
  source: string;
  ranges: Range[];
  contextRanges: Range[];
  literals: Literal[];
  comments: Comment[];
  stack: StackEntry[];
  position: number;
};

type LiteralIndex = {
  byStart: Map<number, Literal>;
  byEnd: Map<number, Literal>;
  first: Int32Array;
  opens: Map<number, number>;
};

export type IndexedScan = Scanned & { index: LiteralIndex };
