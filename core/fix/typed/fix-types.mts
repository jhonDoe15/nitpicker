export type FixFile = { readonly path: string };

export type FixEdit =
  | { readonly type: 'delete'; readonly path: string }
  | { readonly type: 'write'; readonly path: string; readonly text: string };

export type FixWriter = {
  readonly projectRoot: string;
  readonly apply: (
    snapshot: unknown,
    entries: readonly {
      readonly name: string;
      readonly fix: { readonly edits: readonly FixEdit[] };
    }[],
    tool?: string,
  ) => {
    readonly applied: { readonly name: string }[];
    readonly changedMeanwhile: string[];
    readonly errors: string[];
  };
};

export type FixInvocation = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly input: string | undefined;
  readonly environment: NodeJS.ProcessEnv | undefined;
  readonly shell?: true;
  readonly timeout?: number;
};

export type PlannedFix = {
  readonly recipe?: string;
  readonly tool?: string;
  readonly safety: string;
  readonly finding?: {
    readonly tool: string;
    readonly rule: string;
    readonly path: string;
    readonly line: number;
  };
  readonly files: readonly string[];
};

export type DryRunPlan = { readonly patch: Buffer; readonly fixes: readonly PlannedFix[] };

export type FixStep = {
  readonly toolErrors: readonly unknown[];
  readonly notes: readonly string[];
  readonly fixedFindings?: readonly string[];
};

export type FixOutcome = {
  readonly fixedFiles: readonly string[];
  readonly toolErrors: readonly unknown[];
  readonly fixedFindings?: readonly string[];
  readonly notes?: readonly string[];
  readonly dryRun?: DryRunPlan;
};

export type FixSettings = {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly scope: unknown;
  readonly allFiles: boolean;
  readonly dryRun: boolean;
  readonly config: unknown;
  readonly headPolicy: unknown;
  readonly selectedRules: readonly string[];
  readonly executeFixCommand: (invocation: FixInvocation) => unknown;
  readonly writer: FixWriter;
  readonly recipes: unknown;
};
