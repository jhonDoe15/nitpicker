export type WriteEdit = { readonly type: 'write'; readonly path: string; readonly text: string };

export type ReplaceEdit = {
  readonly type: 'replace';
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

type UntrackEdit = { readonly type: 'untrack'; readonly path: string };

export type GitignoreEdit = WriteEdit | ReplaceEdit;

export type UntrackFinding = {
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
};

export type UntrackPlanContext = {
  readonly read: (name: string) => string | undefined;
  readonly inputs: { readonly hygiene?: { readonly findings: readonly UntrackFinding[] } };
};

export type UntrackFix = {
  readonly finding: {
    readonly tool: string;
    readonly rule: string;
    readonly path: string;
    readonly line: number;
  };
  readonly edits: readonly (GitignoreEdit | UntrackEdit)[];
  readonly stays?: string;
};
