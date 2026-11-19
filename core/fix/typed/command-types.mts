import type { SpawnSyncReturns } from 'node:child_process';
import type { FixEntry } from './edit-types.mts';
import type { FixFile, FixRecipe, FixWriter, RecipeFix } from './fix-types.mts';

export type Bytes = ReadonlyMap<string, Buffer>;

export type FixCommandResult = Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'> & {
  readonly error?: { readonly code?: string; readonly message?: string } | undefined;
};

export type FixSpawn = (
  command: string,
  args: readonly string[],
  options?: {
    readonly cwd?: string;
    readonly shell?: true;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly encoding?: 'utf8';
    readonly maxBuffer?: number;
    readonly timeout?: number;
    readonly input?: string;
  },
) => FixCommandResult;

type Formatted = {
  readonly formatted: Map<string, string>;
  readonly unformattable?: string[];
};

export type Formatter = (sources: Map<string, string>) => Formatted;

export type FormatNotesInput = Omit<FormatOutcome, 'changedMeanwhile'> & {
  readonly changedMeanwhile?: readonly string[];
};

export type FormatOutcome = {
  readonly rewritten: readonly string[];
  readonly changedMeanwhile: readonly string[];
  readonly unwritable?: readonly string[];
  readonly unformattable: readonly string[];
  readonly keptAsIs: readonly string[];
  readonly partlyRewritten?: readonly string[];
  readonly undecodable?: readonly string[];
};

export type CollectedFiles = {
  readonly comparison: { readonly mergeBaseSha: string | undefined };
  readonly files: readonly { readonly path: string }[];
  readonly links: readonly string[];
};

export type ToolError = {
  readonly tool: string;
  readonly snapshot: string;
  readonly message: string;
};

type RunSettings = {
  readonly projectRoot: string;
  readonly accepts: (name: string) => boolean;
  readonly writer: FixWriter;
  readonly inputs: Readonly<Record<string, unknown>> | undefined;
};

export type RunState = {
  names: string[];
  fixed: PlannedEntry[];
  changedMeanwhile: Set<string>;
  applyErrors: string[];
  notes: string[];
};

export type Run = {
  readonly active: readonly FixRecipe[];
  readonly settings: RunSettings;
  readonly selected: ReadonlySet<string>;
  readonly failed: Map<string, ToolError>;
  readonly state: RunState;
};

export type PlannedEntry = Omit<FixEntry, 'fix' | 'recipe' | 'safety' | 'scope'> & {
  readonly recipe: string;
  readonly safety: string;
  readonly scope: string;
  readonly fix: RecipeFix;
};

export type PlannedPass = { readonly entries: PlannedEntry[]; readonly notes: string[] };

export type RunOutcome = {
  readonly fixedFindings: string[];
  readonly files: FixFile[];
  readonly toolErrors: ToolError[];
  readonly notes: string[];
};
