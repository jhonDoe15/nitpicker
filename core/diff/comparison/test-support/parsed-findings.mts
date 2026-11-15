import {
  parseAnalyzerReport as parseAnalyzerReportJs,
  parseFinding as parseFindingJs,
} from '../finding-schema.mjs';

export type ParsedFinding = Readonly<Record<string, unknown>>;

export type ParsedReport = {
  readonly findings: readonly ParsedFinding[];
  readonly moduleImports?: readonly { readonly from: string; readonly to: string }[];
};

export const parseFinding: (value: unknown, context?: string) => ParsedFinding = parseFindingJs;

export const parseAnalyzerReport: (value: unknown, analyzerName: string) => ParsedReport =
  parseAnalyzerReportJs;
