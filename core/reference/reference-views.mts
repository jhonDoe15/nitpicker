import {
  PRESETS as UNTYPED_PRESETS,
  exceptionFor as untypedExceptionFor,
} from '../../shared/reference/entry.mjs';
import { presetsOf as untypedPresetsOf } from '../../shared/reference/facts.mjs';
import { PAGES as UNTYPED_PAGES } from '../../shared/reference/pages.mjs';
import {
  entryForFinding as untypedEntryForFinding,
  indexEntries as untypedIndexEntries,
  lookupEntries as untypedLookupEntries,
  readReferenceEntries as untypedReadReferenceEntries,
} from '../../shared/reference/store.mjs';

export type RuleException = {
  key?: string;
  rule: string;
  presetKeys?: Readonly<Record<string, string>>;
  note?: unknown;
  function?: unknown;
  functionRequired?: unknown;
  name?: unknown;
  packages?: unknown;
};

export type RuleEntry = {
  id: string;
  tool: string;
  rule: string;
  page: string;
  anchor: string;
  samples?: string[];
  summary: unknown;
  analyzers: Readonly<Record<string, unknown>>;
  exception: RuleException;
};

export type EntryIndex = object;

export const PRESETS: readonly string[] = UNTYPED_PRESETS;
export const PAGES: readonly { id: string }[] = UNTYPED_PAGES;
export const exceptionFor: (entry: RuleEntry, preset: string) => RuleException | undefined =
  untypedExceptionFor;
export const presetsOf: (entry: RuleEntry) => string[] = untypedPresetsOf;
export const readReferenceEntries: () => RuleEntry[] = untypedReadReferenceEntries;
export const indexEntries: (entries: RuleEntry[]) => EntryIndex = untypedIndexEntries;
export const lookupEntries: (index: EntryIndex, query: string) => RuleEntry[] =
  untypedLookupEntries;
export const entryForFinding: (
  index: EntryIndex,
  finding: { tool: string; rule: string },
) => RuleEntry | undefined = untypedEntryForFinding;
