import type { Scanned } from './scan-shapes.mts';

export type Span = { start: number; end: number };

export type Block = { open: number; close: number };

export type KotlinDeclarations = {
  enums: Set<string>;
  properties: Map<string, string[]>;
};

type RuleContext = {
  declarations: KotlinDeclarations;
  runners: string[];
  file: string;
};

export type Reported = {
  offset: number;
  rule: string;
  subject?: string;
  message?: string;
};

export type SourceRule = (scanned: Scanned, context: RuleContext) => Reported[];

export type RuleSet = {
  messages?: Readonly<Record<string, string>>;
  main?: readonly SourceRule[];
  test?: readonly SourceRule[];
};
