export type FixEdit =
  | { readonly type: 'delete'; readonly path: string }
  | { readonly type: 'write'; readonly path: string; readonly text: string };

export type RecipeEdit =
  | FixEdit
  | {
      readonly type: 'replace';
      readonly path: string;
      readonly start: number;
      readonly end: number;
      readonly text: string;
    }
  | { readonly type: 'move'; readonly from: string; readonly to: string }
  | { readonly type: 'untrack'; readonly path: string };

export type SnapshotEntry = { readonly bytes: Buffer; readonly text: string };

export type Snapshot = {
  readonly files: { readonly path: string; readonly text: string }[];
  readonly read: (name: string) => string | undefined;
  readonly entry: (name: string) => SnapshotEntry | undefined;
  readonly isRead: (name: string) => boolean;
};

export type PlannedFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly line: number;
};

export type FixEntry = {
  readonly name?: string;
  readonly fix: {
    readonly edits: readonly RecipeEdit[];
    readonly finding?: PlannedFinding | undefined;
    readonly alsoFixes?: readonly PlannedFinding[];
    readonly stays?: string;
    readonly note?: string;
  };
} & (
  | { readonly recipe: string; readonly safety: string; readonly scope?: string | undefined }
  | { readonly recipe?: undefined; readonly safety?: undefined; readonly scope?: undefined }
);

type WriteEdit = Extract<RecipeEdit, { type: 'write' }>;

export type PreparedEdit =
  Exclude<RecipeEdit, { type: 'write' }> | (WriteEdit & { readonly isNew?: true });

export type TextEdit = Exclude<PreparedEdit, { type: 'untrack' }>;
export type WholeEdit = Exclude<TextEdit, { type: 'replace' }>;
export type ReplaceEdit = Extract<TextEdit, { type: 'replace' }>;

export type Prepared<Entry extends FixEntry = FixEntry> = {
  readonly entry: Entry;
  readonly edits: readonly PreparedEdit[];
};

export type EditRecord = { readonly undo: () => unknown; readonly commit: () => unknown };

export type EditContext = { readonly projectRoot: string; readonly snapshot: Snapshot };

type ClaimRange = { readonly start: number; readonly end: number };
export type Claim = ClaimRange | 'whole';

export type LooseEdit = {
  readonly type?: unknown;
  readonly path?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly text?: unknown;
};

export type ChangeSource = 'committed' | 'staged' | 'unstaged' | 'untracked';

export type StatusRecord = {
  readonly status: string;
  readonly repositoryPath: string;
  readonly previousRepositoryPath?: string;
};

export type ChangeRecord = StatusRecord & { readonly source: ChangeSource };

export type PendingChange = {
  readonly repositoryPath: string;
  readonly sources: Set<ChangeSource>;
  readonly statuses: Set<string>;
  readonly previousRepositoryPaths: Set<string>;
};

export type WorkingTreeChange = {
  readonly path: string;
  readonly repositoryPath: string;
  readonly baseRepositoryPath: string;
  readonly basePath: string;
  readonly sources: ChangeSource[];
  readonly statuses: string[];
  readonly previousRepositoryPaths: string[];
  readonly isFile: boolean;
};

export type BaseFile = { readonly path: string; readonly baseRepositoryPath: string };

export type UntrackedRequest = {
  readonly repositoryRoot: string;
  readonly projectRepositoryPath: string;
  readonly changesByRepositoryPath: Map<string, PendingChange>;
};

export type CollectRequest = {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: string;
};

export type ReadBaseRequest = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string | undefined;
  readonly files: readonly BaseFile[];
};

export type NameStatusRequest = {
  readonly output: string;
  readonly source: ChangeSource;
  readonly changesByRepositoryPath: Map<string, PendingChange>;
};

export type FinalBaseRequest = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly projectRepositoryPath: string;
};

export type CompleteRequest = {
  readonly change: PendingChange;
  readonly projectRoot: string;
  readonly projectRepositoryPath: string;
  readonly baseRepositoryPath: string;
};
