import type { Finding } from '../../values/findings.mts';

export type SarifOptions = {
  readonly tool?: string | undefined;
  readonly root?: string | undefined;
};

type SkippedResult = { readonly context: string; readonly reason: string };

export type SarifIngest = { readonly findings: Finding[]; readonly skipped: SkippedResult[] };

export type PrepareOptions = {
  readonly roots: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly projectRoot: string;
  readonly identityKey: (result: Readonly<Record<string, unknown>>) => unknown;
};

export type RelocateOptions = Omit<PrepareOptions, 'identityKey'>;

export type ResultIdentityParts = {
  readonly rule: string;
  readonly filePath: string;
  readonly symbol: string | undefined;
};

export type ResultContext = {
  readonly tool: string;
  readonly rules: readonly unknown[];
  readonly options: SarifOptions;
  readonly seen: Map<string, number>;
  readonly findings: Finding[];
  readonly skipped: SkippedResult[];
};

export type RunInput = {
  readonly run: unknown;
  readonly context: string;
  readonly options: SarifOptions;
  readonly findings: Finding[];
  readonly skipped: SkippedResult[];
};

export type SarifLocation = { line: number; column?: number };
