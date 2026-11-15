import type { ExitCode } from '../../../../../core/cli-context.mts';
export type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly snapshot: string;
  readonly classification: string;
  readonly message: string;
  readonly line: number;
  readonly symbol: string;
  readonly identity: string;
  readonly location: { readonly line: number; readonly column?: number };
  readonly metric: { readonly value: number };
  readonly [key: string]: unknown;
};
type SummaryTool = {
  readonly version: string;
  readonly unchanged: number;
  readonly name: string;
  readonly [key: string]: unknown;
};
export type Summary = {
  readonly overallStatus: string;
  readonly tools: readonly [SummaryTool, SummaryTool];
  readonly quick: { readonly message: string };
  readonly configOverrides: unknown;
  readonly [key: string]: unknown;
};
type ReportJson = {
  (name: 'summary.json'): Summary;
  (name: string): Finding[];
};
export type GateResult = {
  readonly exitCode: ExitCode;
  readonly json: ReportJson;
  readonly text: string;
  readonly reports: string;
};
export type PolicyChanges = {
  readonly policyLoosenings: readonly string[];
  readonly policyDigest?: string;
};
export type Files = Readonly<Record<string, string>>;
export type GateOptions = {
  readonly extra?: readonly string[];
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly base?: string;
};
export type BranchSpec = {
  readonly root: string;
  readonly name: string;
  readonly files: Files;
  readonly from: string;
};
export type Sarif = {
  readonly runs: readonly [{ readonly results: readonly { readonly ruleId: string }[] }];
};
