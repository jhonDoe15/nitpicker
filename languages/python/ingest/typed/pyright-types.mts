export type PyrightDiagnostic = {
  readonly file: string;
  readonly message: string;
  readonly rule?: string;
  readonly severity: string;
  readonly range?: { readonly start: { readonly line: number; readonly character: number } };
};

export type PyrightReport = { readonly generalDiagnostics?: readonly PyrightDiagnostic[] };

export type FindingParts = {
  readonly path: string;
  readonly rule: string;
  readonly subject: string;
  readonly severity: string;
  readonly line: number;
  readonly column: number | undefined;
};
