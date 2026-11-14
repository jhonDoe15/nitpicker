export type PyrightDiagnostic = {
  readonly file: string;
  readonly message: string;
  readonly rule?: string;
  readonly severity: string;
  readonly range?: { readonly start: { readonly line: number; readonly character: number } };
};

export type PyrightReport = { readonly generalDiagnostics?: readonly PyrightDiagnostic[] };

export const parsePyrightReport: (text: string) => PyrightReport = JSON.parse;
