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
