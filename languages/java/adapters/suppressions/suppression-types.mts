export type SourceViews = { readonly code: string; readonly withoutComments: string };

export type WarningValue = {
  readonly offset: number;
  readonly end: number;
  readonly literal: boolean;
  readonly values: readonly string[];
};

export type Suppression = {
  readonly tool: string;
  readonly offset: number;
  readonly found: string;
};

export type InlineFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly location: { readonly line: number };
};
