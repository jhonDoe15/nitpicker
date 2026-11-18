type HandlerSpan = { readonly start: number; readonly end: number };

export type ParsedParameter = {
  readonly annotations: string[];
  readonly name: string;
  readonly type: string;
};

export type ParameterKind = 'param' | 'form';

export type Handler = {
  readonly method: string;
  readonly parts: HandlerSpan[];
  readonly body: string;
};

export type HandlerParameter = {
  readonly method: string;
  readonly kind: ParameterKind;
  readonly name: string;
  readonly offset: number;
  readonly body: string;
};

export type CallBefore = {
  readonly name: string;
  readonly receiver: string;
  readonly position: number;
};

export type HelperInfo = {
  readonly parameters: (string | undefined)[];
  readonly body: string;
};

export type HelperTarget = { readonly helper: HelperInfo; readonly name: string };

export type LookupItem = { readonly call: CallBefore; readonly depth: number };

export type SourceFile = { readonly path: string; readonly code: string };

export type Occurrence = {
  readonly index: number;
  readonly text: string;
  readonly field: string;
  readonly name: string;
  readonly alias?: true;
};
