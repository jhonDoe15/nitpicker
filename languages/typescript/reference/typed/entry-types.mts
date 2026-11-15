import { ruleEntry as untypedRuleEntry } from '../../../../shared/reference/entry.mjs';
import { wordsOfKebab as untypedWordsOfKebab } from '../../../../shared/reference/build/words.mjs';
import { counterpartsOf as untypedCounterpartsOf } from '../../../../shared/reference/counterparts.mjs';

export type RuleEntry = {
  readonly id: string;
  readonly tool: string;
  readonly rule: string;
  readonly anchor: string;
} & Readonly<Record<string, unknown>>;

type EntryFields = { readonly tool: string; readonly rule: string } & Readonly<
  Record<string, unknown>
>;

export const ruleEntry: (fields: EntryFields) => RuleEntry = untypedRuleEntry;

export const wordsOfKebab: (name: string) => string = untypedWordsOfKebab;

export const counterpartsOf: (id: string) => readonly object[] = untypedCounterpartsOf;
