import { PRESET_TITLES } from '../../../shared/reference/entry.mjs';
import { fixStatusIn } from '../../../shared/reference/fix-status.mjs';
import { entryFacts, entryLinks, linkUrl, plainText } from '../../../shared/reference/facts.mjs';
import {
  closestIds,
  indexEntries,
  lookupEntries,
  readReferenceEntries,
  referenceUrl,
} from '../../../shared/reference/store.mjs';
import { chainOf } from '../../../shared/traversal.mjs';

export type Fact = {
  readonly label: string;
  readonly text?: string;
  readonly items?: readonly string[];
  readonly code?: string;
};

export type Link = {
  readonly label: string;
  readonly path: string | undefined;
  readonly anchor: string | undefined;
  readonly url: string | undefined;
};

export type Entry = {
  readonly id: string;
  readonly summary: string;
  readonly page?: string;
  readonly tool?: string;
  readonly findingTools?: readonly string[];
  readonly fix?: Readonly<Record<string, string>>;
  readonly analyzers: Readonly<Record<string, readonly string[] | undefined>>;
};

export type EntryIndex = { readonly entries: readonly Entry[] };

export const fixStatusOf: (entry: Entry, preset: string) => string = fixStatusIn;
export const presetTitles: Readonly<Record<string, string>> = PRESET_TITLES;
export const factsOf: (entry: Entry) => readonly Fact[] = entryFacts;
export const linksOf: (entry: Entry) => readonly Link[] = entryLinks;
export const linkTarget: (link: Link, root: string | undefined) => string | undefined = linkUrl;
export const textFor: (text: string, root: string | undefined) => string = plainText;
export const readEntries: () => readonly Entry[] = readReferenceEntries;
export const indexOf: (entries: readonly Entry[]) => EntryIndex = indexEntries;
export const entriesNamed: (index: EntryIndex, query: string) => readonly Entry[] = lookupEntries;
export const closestNames: (index: EntryIndex, query: string) => readonly string[] = closestIds;
export const entryUrl: (entry: Entry, root: string | undefined) => string | undefined =
  referenceUrl;
export const directoriesUp: (
  start: string,
  next: (directory: string) => string | undefined,
) => readonly string[] = chainOf;
