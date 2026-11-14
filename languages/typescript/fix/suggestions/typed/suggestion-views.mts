import {
  isRuleSelected as untypedIsRuleSelected,
  suggestionName as untypedSuggestionName,
  suggestionRules as untypedSuggestionRules,
} from '../suggestion-rules.mjs';

type LintFix = {
  readonly range?: readonly number[] | undefined;
  readonly text?: string | undefined;
};

export type LintMessage = {
  readonly ruleId?: string | undefined;
  readonly line?: number | undefined;
  readonly fatal?: true | undefined;
  readonly fix?: LintFix | undefined;
  readonly suggestions?: readonly { readonly fix?: LintFix | undefined }[] | undefined;
};

export const isRuleSelected: (
  rule: string | undefined,
  selectedRules: readonly string[],
) => boolean = untypedIsRuleSelected;

export const suggestionName: (rule: string | undefined) => string = untypedSuggestionName;

export const suggestionRules: Readonly<Record<string, string>> = untypedSuggestionRules;
