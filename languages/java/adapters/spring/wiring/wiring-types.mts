export type Feature = {
  readonly enabler: string[];
  readonly xml: RegExp;
  readonly users: string[];
};

export type WiringSource = { readonly path: string; readonly text: string };

export type WiringCode = { readonly path: string; readonly code: string };

export type AnnotationUse = { readonly simple: string; readonly offset: number };
