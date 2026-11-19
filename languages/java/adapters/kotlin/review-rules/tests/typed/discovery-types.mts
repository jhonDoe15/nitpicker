import type { Span } from '../../../scan/typed/rule-shapes.mts';
import type { Scanned } from '../../../scan/typed/scan-shapes.mts';

export type { Span };

export type TextTables = { trim: Int32Array; openFor: Int32Array; closeFor: Int32Array };

type Memo = {
  has(key: string): boolean;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
};

export type TextSource = { code: string; tables?: TextTables; memo?: Memo };

export type TestScanned = Scanned & {
  tables: TextTables;
  assertionNames: Set<string>;
  memo: Memo;
};

export type Annotation = { name: string; args: string; offset: number };

export type Header = { annotations: Annotation[]; modifiers: Set<string>; start: number };

export type SuperType = { name: string; callOpen: number };

export type ClassInfo = {
  kind: string;
  name: string;
  offset: number;
  start: number;
  end: number;
  annotations: Annotation[];
  modifiers: Set<string>;
  supers: SuperType[];
  bodyOpen: number;
  bodyClose: number;
};

export type FunctionBody = Span & { expression: boolean; returns: string };

export type FunctionInfo = {
  name: string;
  receiver: string;
  offset: number;
  start: number;
  annotations: Annotation[];
  modifiers: Set<string>;
  body: FunctionBody;
};

type ImportAlias = { target: string; qualified: string };

export type Imports = {
  explicit: Map<string, string>;
  aliases: Map<string, ImportAlias>;
  stars: Set<string>;
};

export type Host = { name: string; args: string; receiver: string };

export type HostFrame = Host & { open: number };

export type Found = {
  callee: string;
  prefix: string;
  offset: number;
  literal: number;
  configs: string[];
  body: Span;
};

export type Registration = Found & { dynamic: boolean };

export type KotestView = {
  scanned: TestScanned;
  braces: Int32Array;
  parens: Int32Array;
  imports: Imports;
  literalTexts: Map<number, string>;
};

export type VisitItem = {
  start: number;
  end: number;
  parent: RawNode | undefined;
  chain: number[];
};

export type RawNode = {
  callee: string;
  prefix: string;
  name: string;
  configs: string[];
  offset: number;
  body: Span;
  dynamic: boolean;
  parent: RawNode | undefined;
  ancestors: number[];
  path: string[];
};

export type SpecNode = RawNode & { leaf: boolean };

export type BareNode = {
  framework: 'junit' | 'kotest';
  symbol: string;
  name: string;
  prefix?: string;
  offset: number;
  annotations: Annotation[];
  configs: string[];
  body: Span;
  ancestors: number[];
  leaf: boolean;
  dynamic: boolean;
  factory: boolean;
};

type SuiteOf<Node> = {
  klass: ClassInfo;
  ancestors: ClassInfo[];
  symbol: string;
  offset: number;
  annotations: Annotation[];
  nodes: Node[];
};

export type BareSuite = SuiteOf<BareNode>;

export type TestNode = BareNode & { suite: BareSuite };

export type Suite = SuiteOf<TestNode>;
