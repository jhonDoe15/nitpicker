export type Range = readonly [number, number];

export type AstNode = {
  readonly type: string;
  readonly range: Range;
  parent?: AstNode;
};

export type Comment = {
  readonly type: string;
  readonly value: string;
  readonly range: Range;
  readonly loc: { readonly start: { readonly line: number } };
};

export type Token = { readonly range: Range };

export type Program = AstNode & {
  readonly tokens: readonly Token[];
  readonly comments: readonly Comment[];
};

export type SourceCode = {
  readonly getTokenAfter: (comment: Comment) => Token | undefined;
  readonly getNodeByRangeIndex: (index: number) => AstNode | undefined;
  readonly getAncestors: (node: AstNode) => AstNode[];
};

export type Finding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};

export type DeletionFix = {
  readonly finding: Finding;
  readonly edits: readonly {
    readonly type: string;
    readonly path: string;
    readonly start: number;
    readonly end: number;
    readonly text: string;
  }[];
};

export type PlanInputs = Readonly<Record<string, unknown>>;

export type PlanContext = {
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly inputs: PlanInputs;
};
