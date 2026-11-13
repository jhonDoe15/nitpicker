export type Location = {
  readonly line: number;
  readonly column?: number;
  readonly endLine?: number;
};

export type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly symbol?: string;
  readonly location?: Location;
  readonly [field: string]: unknown;
};

export type ReportEntry = {
  readonly tool?: unknown;
  readonly snapshot?: unknown;
  readonly rule?: unknown;
  readonly path?: unknown;
  readonly message?: unknown;
  readonly classification?: unknown;
  readonly [field: string]: unknown;
};

export type AnalyzerReport = {
  readonly findings: readonly Finding[];
  readonly moduleImports?: readonly { readonly from: string; readonly to: string }[];
};

function isEntry(value: unknown): value is ReportEntry {
  return typeof value === 'object' && value !== null;
}

export function entriesOf(value: unknown): ReportEntry[] {
  return Array.isArray(value) ? value.filter(isEntry) : [];
}
