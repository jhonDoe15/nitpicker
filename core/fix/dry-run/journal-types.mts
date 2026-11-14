import { applyFixes as untypedApplyFixes } from '../engine/edits/apply-edits.mjs';
import { sourceOf as untypedSourceOf } from '../engine/edits/check-fixes.mjs';
import { checkRealPath as untypedCheckRealPath } from '../engine/edits/real-paths.mjs';
import {
  indexListing as untypedIndexListing,
  restoreIndex as untypedRestoreIndex,
} from '../engine/edits/untrack.mjs';
import { trackCleanup as untypedTrackCleanup } from '../../tooling/temporary-files.mjs';
import { fieldOf, listOf, numberOr, parseJson, textOf } from '../../../shared/values/readers.mts';
import type { PlannedFix } from '../typed/fix-types.mts';

export type FileState = { readonly bytes: Buffer; readonly mode: number };

export type Original = FileState | { readonly createdUnder?: string | undefined };

export type FixedState = FileState | { readonly gone: true };

export type JournalEdit =
  | { readonly type: 'move'; readonly from: string; readonly to: string }
  | {
      readonly type: 'delete' | 'write' | 'replace' | 'untrack' | 'chmod' | 'json' | 'code';
      readonly path: string;
    };

export type JournalEntry = {
  readonly name: string;
  readonly fix: {
    readonly edits: readonly JournalEdit[];
    readonly finding?: PlannedFix['finding'];
  };
} & (
  | { readonly recipe: string; readonly safety: string }
  | { readonly recipe?: undefined; readonly safety?: undefined }
);

export type ApplyResult = {
  readonly applied: JournalEntry[];
  readonly changedMeanwhile: string[];
  readonly errors: string[];
};

export type JournalEvent = Omit<PlannedFix, 'files'> & { readonly files: readonly string[] };

export type Journal = {
  readonly projectRoot: string;
  readonly originals: Map<string, Original>;
  readonly fixed: Map<string, FixedState>;
  readonly indexListings: Map<string, string>;
  events: JournalEvent[];
  readonly savers: (() => void)[];
};

export type Change = {
  readonly name: string;
  readonly before: FileState | undefined;
  readonly after: FileState | undefined;
};

export type JournalWriter = {
  readonly projectRoot: string;
  readonly apply: (
    snapshot: unknown,
    entries: readonly JournalEntry[],
    tool?: string,
  ) => ApplyResult;
};

export const applyFixes: (
  projectRoot: string,
  snapshot: unknown,
  entries: readonly JournalEntry[],
) => ApplyResult = untypedApplyFixes;
export const sourceOf: (edit: JournalEdit) => string = untypedSourceOf;
export const checkRealPath: (projectRoot: string, name: string) => string = untypedCheckRealPath;
export const indexListing: (projectRoot: string, name: string) => string = untypedIndexListing;
export const restoreIndex: (projectRoot: string, listings: readonly string[]) => void =
  untypedRestoreIndex;
export const trackCleanup: (cleanup: () => void) => () => void = untypedTrackCleanup;

type SavedJournal = {
  readonly projectRoot: string;
  readonly originals: readonly (readonly [string, unknown])[];
  readonly fixed: readonly (readonly [string, unknown])[];
  readonly indexListings: readonly (readonly [string, string])[];
};

function pairsOf(value: unknown): (readonly [string, unknown])[] {
  return listOf(value).map((pair) => [textOf(listOf(pair)[0]), listOf(pair)[1]]);
}

export function savedJournal(text: string): SavedJournal {
  const saved = parseJson(text);
  return {
    projectRoot: textOf(fieldOf(saved, 'projectRoot')),
    originals: pairsOf(fieldOf(saved, 'originals')),
    fixed: pairsOf(fieldOf(saved, 'fixed')),
    indexListings: pairsOf(fieldOf(saved, 'indexListings')).map(([name, listing]) => [
      name,
      textOf(listing),
    ]),
  };
}

function decodedFile(state: unknown): FileState | undefined {
  const bytes = fieldOf(state, 'bytes');
  return typeof bytes === 'string'
    ? { bytes: Buffer.from(bytes, 'base64'), mode: numberOr(fieldOf(state, 'mode'), 0) }
    : undefined;
}

export function decodedOriginal(state: unknown): Original {
  const createdUnder = fieldOf(state, 'createdUnder');
  return decodedFile(state) ?? (typeof createdUnder === 'string' ? { createdUnder } : {});
}

export function decodedFixed(state: unknown): FixedState {
  return decodedFile(state) ?? { gone: true };
}

export type Located =
  | { readonly file: string; readonly error: undefined }
  | { readonly file: undefined; readonly error: unknown };

export type DryRunResult<Result> = {
  readonly result: Result;
  readonly recovered: readonly string[];
  readonly patch: Buffer;
  readonly fixes: readonly PlannedFix[];
  readonly files: string[];
};
