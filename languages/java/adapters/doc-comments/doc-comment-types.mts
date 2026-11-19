export type TypeInfo = { readonly name: string; readonly kind: string | undefined };

export type Pair = { readonly open: number; close: number; readonly parent: number };

export type ScopeContext = {
  readonly pairs: readonly Pair[];
  readonly types: ReadonlyMap<number, TypeInfo>;
};

export type Scope = {
  readonly chain: string[];
  readonly type: TypeInfo | undefined;
  readonly declarable: boolean;
};

export type Declared = {
  readonly name: string | undefined;
  readonly receiver?: string | undefined;
  readonly parameters?: string | undefined;
};

export type Header = { readonly text: string; readonly stop: string; readonly at: number };

export type DocComment = {
  readonly line: number;
  readonly name: string | undefined;
  readonly qualifier: string;
  readonly lines: readonly string[];
  readonly detailed: boolean;
};

export type DocCommentInput = {
  readonly text: string;
  readonly marker?: RegExp;
  readonly line: number;
  readonly declared: Declared;
  readonly chain: readonly string[];
};

export type DocEntry = {
  readonly span: { readonly start: number; readonly end: number };
  readonly comment: DocComment;
};
