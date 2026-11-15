import type { ImportsReport, PythonModule } from '../../analysis/typed/python-graph-types.mts';
import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';
import type { ExceptionEntry } from '../../configuration/python-exceptions.mts';

export type Manifest = {
  readonly quick?: unknown;
  readonly testsRan?: unknown;
  readonly testRunner?: string;
  readonly formatter: string;
  readonly formatterDetected?: unknown;
  readonly sourceRoots?: readonly string[];
  readonly [field: string]: unknown;
};

export type ReportPolicy = {
  readonly layout?: unknown;
  readonly snapshot?: string;
  readonly history?: unknown;
  readonly headPolicy?: object | undefined;
  readonly baselineRoot?: string | undefined;
  readonly fileLimits?: Readonly<Record<string, unknown>>;
  readonly exceptions?: readonly unknown[];
  readonly crapLimit?: unknown;
  readonly testSeconds?: unknown;
  readonly [field: string]: unknown;
};

export type ReadFindingsOptions = {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly crapLimit?: unknown;
  readonly policy?: ReportPolicy;
  readonly exceptions?: readonly ExceptionEntry[] | undefined;
};

export type RuffExtras = {
  readonly testFiles?: readonly string[];
  readonly supportFiles?: readonly string[];
  readonly allowed?: readonly unknown[];
  readonly exceptions?: readonly ExceptionEntry[];
};

export type { IngestedFinding };

export type { ImportsReport, PythonModule };

export type FindingsReport = {
  findings: IngestedFinding[];
  readonly [section: string]: unknown;
};

export type RuffInput = {
  readonly reportRoot: string;
  readonly roots: readonly string[];
  readonly projectRoot: string;
  readonly exceptions: readonly ExceptionEntry[];
};

export type CrapInput = {
  readonly reportRoot: string;
  readonly coverage: string;
  readonly projectRoot: string;
  readonly roots: readonly string[];
  readonly crapLimit?: unknown;
};

export type RunInput = Omit<CrapInput, 'coverage'> & { readonly manifest: Manifest };

export type ShapeInput = {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly policy: ReportPolicy;
  readonly imports: ImportsReport;
  readonly manifest: Manifest;
};

export type AllowedSite = {
  readonly owner?: string;
  readonly path: string;
  readonly line: number;
};

export type SarifResult = { readonly message?: { readonly text?: string } };

export type TypesReport = { readonly checker: string; readonly output: string };
