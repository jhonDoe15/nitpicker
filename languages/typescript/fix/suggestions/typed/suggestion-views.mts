import {
  isListedSuggestion as untypedIsListedSuggestion,
  isRuleSelected as untypedIsRuleSelected,
  pickedSuggestions as untypedPickedSuggestions,
  suggestionName as untypedSuggestionName,
  suggestionRules as untypedSuggestionRules,
} from '../suggestion-rules.mts';

type LintFix = {
  readonly range?: readonly number[] | undefined;
  readonly text?: string | undefined;
};

export type LintMessage = {
  readonly ruleId?: string | undefined;
  readonly line?: number | undefined;
  readonly fatal?: true | undefined;
  readonly fix?: LintFix | undefined;
  readonly suggestions?:
    | readonly { readonly fix?: LintFix | undefined; readonly messageId?: string | undefined }[]
    | undefined;
};

export const isRuleSelected: (
  rule: string | undefined,
  selectedRules: readonly string[],
) => boolean = untypedIsRuleSelected;

export const isListedSuggestion: (
  rule: string | undefined,
  messageId: string | undefined,
) => boolean = untypedIsListedSuggestion;

export const suggestionName: (rule: string | undefined) => string = untypedSuggestionName;

export const suggestionRules: Readonly<Record<string, string>> = untypedSuggestionRules;

export const pickedSuggestions: Readonly<Record<string, string>> = untypedPickedSuggestions;
