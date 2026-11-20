import { containedPath as untypedContainedPath } from '../../tool-steps/paths/contained-path.mts';
import {
  fixerError as untypedFixerError,
  fixSpawn as untypedFixSpawn,
  runFixCommand as untypedRunFixCommand,
} from '../../tool-steps/commands/fix-command.mts';
import {
  changedFiles as untypedChangedFiles,
  collectFixFiles as untypedCollectFixFiles,
  excludedBy as untypedExcludedBy,
  readBytes as untypedReadBytes,
  rewrittenPaths as untypedRewrittenPaths,
  splitByEncoding as untypedSplitByEncoding,
} from '../../tool-steps/fix-files.mts';
import {
  formatNotes as untypedFormatNotes,
  linkNote as untypedLinkNote,
  undecodableNote as untypedUndecodableNote,
} from '../../tool-steps/fix-notes.mts';
import { rewriteFormatted as untypedRewriteFormatted } from '../../tool-steps/format-rewrite.mts';
import { toolPrecedenceOf as untypedToolPrecedenceOf } from '../../tool-steps/tool-precedence.mts';
import { withFixedLineEndingsOf as untypedWithFixedLineEndingsOf } from '../../tool-steps/rewrite/line-endings.mts';
import { runRecipes as untypedRunRecipes } from '../../engine/run-recipes.mts';
import { writeTexts as untypedWriteTexts } from '../../engine/write-texts.mts';
import { sharedInputs as untypedSharedInputs } from '../../recipes/shared-inputs.mts';
import { SHARED_RECIPES as UNTYPED_SHARED_RECIPES } from '../../recipes/shared-recipes.mts';
import {
  trackTemporaryPath as untypedTrack,
  untrackTemporaryPath as untypedUntrack,
} from '../../../tooling/temporary-files.mts';
import type {
  Bytes,
  FixCommandResult,
  FixSpawn,
  Formatter,
  FormatNotesInput,
  FormatOutcome,
} from '../command-types.mts';
import type {
  FixFile,
  FixInvocation,
  FixSettings,
  FixStep,
  FixWriter,
  PlannedFix,
} from '../fix-types.mts';

export type RecipeResult = FixStep & {
  readonly files: readonly FixFile[];
  readonly fixedFindings: readonly string[];
};

type ExecuteFixCommand = (invocation: FixInvocation) => unknown;
type PlannedText = {
  readonly name: string;
  readonly bytes: Buffer | undefined;
  readonly text: string;
  readonly recipe?: string;
  readonly safety?: string;
  readonly findings?: readonly NonNullable<PlannedFix['finding']>[];
};

export type { Bytes, FixCommandResult, FixSpawn, FormatOutcome };

export const containedPath: (root: string, name: string) => string = untypedContainedPath;
export const fixerError: (
  tool: string,
  error: unknown,
) => { tool: string; snapshot: string; message: string } = untypedFixerError;
export const runFixCommand: (command: {
  readonly operation: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly acceptedStatuses: readonly number[];
  readonly environment: NodeJS.ProcessEnv;
  readonly input: string | undefined;
  readonly executeFixCommand: ExecuteFixCommand;
  readonly describe?: (result: FixCommandResult) => string;
}) => FixCommandResult = untypedRunFixCommand;
export const fixSpawn: (options: {
  readonly operation: string;
  readonly executeFixCommand: ExecuteFixCommand;
}) => FixSpawn = untypedFixSpawn;
export const collectFixFiles: (options: {
  readonly repositoryRoot: string;
  readonly projectRoot: string;
  readonly baseRef: unknown;
  readonly scope: unknown;
  readonly allFiles: boolean;
  readonly accepts: (name: string) => boolean;
}) => {
  readonly comparison: { readonly mergeBaseSha: string | undefined };
  readonly files: readonly FixFile[];
  readonly links: readonly string[];
} = untypedCollectFixFiles;
export const readBytes: (projectRoot: string, files: readonly FixFile[]) => Bytes =
  untypedReadBytes;
export const changedFiles: (
  projectRoot: string,
  files: readonly FixFile[],
  before: Bytes,
) => readonly FixFile[] = untypedChangedFiles;
export const rewrittenPaths: (
  projectRoot: string,
  files: readonly FixFile[],
  before: Bytes,
) => string[] = untypedRewrittenPaths;
export const splitByEncoding: (
  projectRoot: string,
  files: readonly FixFile[],
) => { readonly files: readonly FixFile[]; readonly undecodable: readonly string[] } =
  untypedSplitByEncoding;
export const excludedBy: (globs: string[] | undefined) => (name: string) => boolean =
  untypedExcludedBy;
export const formatNotes: (tool: string, outcome: FormatNotesInput) => string[] =
  untypedFormatNotes;
export const linkNote: (paths: readonly string[]) => string[] = untypedLinkNote;
export const undecodableNote: (paths: readonly string[]) => string[] = untypedUndecodableNote;
export const withFixedLineEndingsOf: (source: string, fixed: string) => string =
  untypedWithFixedLineEndingsOf;
export const writeTexts: (
  writer: FixWriter,
  planned: readonly PlannedText[],
  tool: string,
) => {
  readonly written: string[];
  readonly changedMeanwhile: string[];
  readonly unwritable: string[];
} = untypedWriteTexts;
export const rewriteFormatted: (options: {
  readonly projectRoot: string;
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string | undefined;
  readonly files: readonly FixFile[];
  readonly format: Formatter;
  readonly formatBase?: Formatter;
  readonly keepLineEndings: boolean;
  readonly writer?: FixSettings['writer'];
  readonly allFiles: boolean;
  readonly tool?: string;
}) => FormatOutcome = untypedRewriteFormatted;
export const toolPrecedenceOf: (
  tools: Readonly<Record<string, { readonly precedence?: string[] }>> | undefined,
) => Record<string, string[] | undefined> = untypedToolPrecedenceOf;
export const trackTemporaryPath: (path: string) => string = untypedTrack;
export const untrackTemporaryPath: (path: string) => void = untypedUntrack;
export const runRecipes: (options: {
  readonly projectRoot: string;
  readonly files: readonly FixFile[];
  readonly recipes: readonly unknown[];
  readonly writer: FixSettings['writer'];
  readonly preset: string;
  readonly selectedRules: readonly string[];
  readonly accepts: (name: string) => boolean;
  readonly inputs: Readonly<Record<string, unknown>>;
}) => RecipeResult = untypedRunRecipes;
export const sharedInputs: (options: {
  readonly projectRoot: string;
  readonly headPolicy: object | undefined;
  readonly selectedRules: readonly string[];
}) => {
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly toolErrors: readonly unknown[];
} = untypedSharedInputs;
export const SHARED_RECIPES: readonly unknown[] = UNTYPED_SHARED_RECIPES;
