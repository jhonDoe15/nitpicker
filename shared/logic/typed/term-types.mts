export type Range = readonly [number, number];

export type ModelName = 'size' | 'index' | 'absolute' | 'random' | 'stable';

export type NamedTest = { readonly name: string; readonly text: string };

export type Term = {
  readonly kind: string;
  readonly value: string | undefined;
  readonly children: Term[];
  readonly range: Range | undefined;
  readonly loose?: true;
  readonly assignment?: true;
  readonly boolean?: true;
  readonly integer?: true;
  readonly signed?: true;
  readonly bits?: number;
  readonly model?: ModelName;
  readonly helper?: NamedTest;
};

export type Model = {
  readonly integer?: true;
  readonly number?: true;
  readonly nonNegative?: true;
  readonly min?: number;
  readonly below?: number;
  readonly stable: boolean;
  readonly reason: string;
};

export type WidthTag = { readonly bits: number; readonly signed: boolean };

export type WidthLabel = 'byte' | 'short' | 'char' | 'int' | 'long';

export type Verdict = 'true' | 'false' | 'open' | 'unreachable';

export type RewriteContext = { readonly booleanContext: boolean };

export type ExpressionRewrite = {
  readonly name: string;
  readonly rewrite: (node: Term, context: RewriteContext) => Term | undefined;
};

export type BlockRewrite = { readonly node: Term; readonly range: Range | undefined };

export type StatementRewrite = {
  readonly name: string;
  readonly rewrite: (block: Term) => BlockRewrite | undefined;
};

export type RewriteSet = {
  readonly expressions: readonly ExpressionRewrite[];
  readonly statements: readonly StatementRewrite[];
};

export type AppliedRewrite = { readonly rewrite: string; readonly range: Range | undefined };
