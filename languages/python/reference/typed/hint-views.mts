import { counterpartsOf as untypedCounterparts } from '../../../../shared/reference/counterparts.mjs';
import { ruleEntry as untypedRuleEntry } from '../../../../shared/reference/entry.mjs';
import {
  hintFor as untypedHintFor,
  RULE_HINTS as UNTYPED_RULE_HINTS,
} from '../../rules/rule-hints.mts';

export type RuleHintView = {
  readonly tool: string;
  readonly rules?: unknown;
  readonly allowed?: unknown;
  describe?(subject: string, libraries: unknown, data: unknown): string;
  readonly referenceData?: unknown;
  readonly exception?: unknown;
};

export type EntryFields = {
  readonly tool: string;
  readonly rule: string;
  readonly [field: string]: unknown;
};

export type EntryView = {
  readonly id: string;
  readonly tool: string;
  readonly rule: string;
  readonly anchor: string;
  readonly [field: string]: unknown;
};

export const RULE_HINTS: readonly RuleHintView[] = UNTYPED_RULE_HINTS;
export const ruleEntry: (fields: EntryFields) => EntryView = untypedRuleEntry;
export const hintFor: (finding: { tool: string; rule: string }) => RuleHintView | undefined =
  untypedHintFor;
export const counterpartsOf: (rule: string) => readonly unknown[] = untypedCounterparts;
