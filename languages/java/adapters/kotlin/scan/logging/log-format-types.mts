import type { Span } from '../typed/rule-shapes.mts';

export type Conversion = { argument: number; conversion: string };

export type ParsedFormat = {
  malformed: boolean;
  required: number;
  conversions: Conversion[];
  otherSyntax: boolean;
};

export type ApiEntry = { api: string; printf: boolean; formats: boolean };

export type FormatCall = ApiEntry & {
  method: string;
  start: number;
  format: Span;
  rest: string[];
  restParts: Span[];
};

export type FileContext = {
  jboss: boolean;
  jul: boolean;
  log4j: boolean;
  formatters: Set<string>;
  declared: Set<string>;
};

export type RawCall = { receiver: string; method: string; parts: Span[]; texts: string[] };

export type FormatValue = { dynamic?: true; template?: true; text?: string; unknown?: true };

export type Checked = { code: string; call: FormatCall; values: string[] };
