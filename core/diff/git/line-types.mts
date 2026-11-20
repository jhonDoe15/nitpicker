export type Span = { readonly start: number; readonly count: number };

type HunkSide = Span & { readonly lines: readonly string[] };

export type Hunk = {
  readonly base: HunkSide;
  readonly head: HunkSide;
  readonly complete: boolean;
};

export type HunkTuple = readonly [number, number, number, number];

export type LineSources = {
  readonly base: string | undefined;
  readonly head: string | undefined;
};

export type LineRange = [number, number];

export type CarriedLine = readonly [number, number];

export type ChangedFile = {
  readonly path: string;
  readonly added: boolean;
  readonly ranges: LineRange[];
  readonly inserted: LineRange[];
  readonly deletions: number[];
  readonly hunks: HunkTuple[];
  readonly carried: CarriedLine[];
  readonly sources?: LineSources | undefined;
};

export type LineSource = {
  readonly path?: string;
  readonly hunks?: readonly HunkTuple[];
  readonly carried?: readonly CarriedLine[];
  readonly sources?: LineSources | undefined;
};

export type LineMap = {
  baseLineOf(line: number): number | undefined;
  headLineOf(line: number): number;
  isOutsideHunks(line: number, side?: 'base' | 'head'): boolean;
  hasSameText(head: LinePosition, base: LinePosition): boolean;
};

export type LinePosition = {
  readonly line: number;
  readonly column?: number | undefined;
};

export type Alignment = {
  readonly changed: Set<number>;
  readonly carried: CarriedLine[];
};

export type SourceRequest = {
  readonly filePath: string;
  readonly basePath: string | undefined;
};

export type FileSection = {
  readonly filePath: string;
  readonly basePath: string | undefined;
  readonly added: boolean;
  readonly hunks: Hunk[];
};

export type ReadSources = (files: SourceRequest[]) => Map<string, LineSources>;

export type ChangedLinesRequest = {
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string;
  readonly headSha: string;
  readonly projectRelativePath: string;
  readonly baseProjectRelativePath?: string | undefined;
  readonly inferredMoves?: ReadonlyMap<string, string> | undefined;
};
