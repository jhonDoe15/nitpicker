import { adviceOf as untypedAdviceOf } from '../../../../shared/reference/build/messages.mjs';
import {
  guideCell as untypedGuideCell,
  optionalGuideCell as untypedOptionalGuideCell,
} from '../../../../shared/reference/build/guide-tables.mjs';
import {
  flatText as untypedFlatText,
  paragraphsOf as untypedParagraphsOf,
  splitFirstSentence as untypedSplitFirstSentence,
} from '../../../../shared/reference/build/text.mjs';
import { wordsOfCamelCase as untypedWordsOfCamelCase } from '../../../../shared/reference/build/words.mjs';
import { counterpartsOf as untypedCounterpartsOf } from '../../../../shared/reference/counterparts.mjs';
import {
  asSentence as untypedAsSentence,
  entriesFrom as untypedEntriesFrom,
  ruleEntry as untypedRuleEntry,
} from '../../../../shared/reference/entry.mjs';

export type RuleEntry = {
  readonly id: string;
  readonly tool: string;
  readonly rule: string;
  readonly anchor: string;
  readonly why?: unknown;
} & Readonly<Record<string, unknown>>;

export type EntryFields = { readonly tool: string; readonly rule: string } & Readonly<
  Record<string, unknown>
>;

export type EntryDefaults = {
  readonly exceptionKey?: string;
  readonly exceptionRule?: (rule: string) => string;
} & Readonly<Record<string, unknown>>;

export type EntryRow = readonly [
  rule: string,
  summary: string,
  allowed?: string | undefined,
  extra?: Readonly<Record<string, unknown>>,
];

export type DocsLink = { readonly label: string; readonly path: string; readonly anchor?: string };

export const ruleEntry: (fields: EntryFields) => RuleEntry = untypedRuleEntry;
type RequiredDefaults = {
  readonly exceptionKey: string | undefined;
  readonly exceptionRule: ((rule: string) => string) | undefined;
} & Readonly<Record<string, unknown>>;

const entriesWith: (defaults: RequiredDefaults, rows: readonly EntryRow[]) => RuleEntry[] =
  untypedEntriesFrom;

export function entriesFrom(defaults: EntryDefaults, rows: readonly EntryRow[]): RuleEntry[] {
  return entriesWith({ exceptionKey: undefined, exceptionRule: undefined, ...defaults }, rows);
}
export const asSentence: (text: string) => string = untypedAsSentence;
export const adviceOf: (message: string) => string = untypedAdviceOf;
export const guideCell: (guide: string, id: string, header: string) => string = untypedGuideCell;
export const optionalGuideCell: (guide: string, id: string, header: string) => string | undefined =
  untypedOptionalGuideCell;
export const flatText: (text: string) => string = untypedFlatText;
export const paragraphsOf: (text: string) => string[] = untypedParagraphsOf;
export const splitFirstSentence: (text: string) => {
  first: string | undefined;
  rest: string | undefined;
} = untypedSplitFirstSentence;
export const wordsOfCamelCase: (name: string) => string = untypedWordsOfCamelCase;
export const counterpartsOf: (rule: string) => DocsLink[] = untypedCounterpartsOf;
