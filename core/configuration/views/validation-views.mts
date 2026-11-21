import {
  liftsOnlyRules as untypedLiftsOnlyRules,
  validateExceptions as untypedValidateExceptions,
} from '../../../shared/exceptions/validation.mts';
import { canonicalRule as untypedCanonicalRule } from '../../../shared/exceptions/rule-names.mts';
import { RULES as untypedRules } from '../../../shared/policy.mts';
import {
  didYouMean as untypedDidYouMean,
  suggestionOrAllowed as untypedSuggestionOrAllowed,
} from '../../../shared/messages/closest-match.mts';
import { stylingApproaches as untypedStylingApproaches } from '../../../languages/typescript/preset/eslint-config/react/react-rules.mts';
import { i18nRuleIds as untypedI18nRuleIds } from '../../../languages/typescript/preset/eslint-config/i18n/i18n-rules.mts';

export { isNonEmptyString } from '../../../shared/config.mts';

export const liftsOnlyRules: (exceptions: unknown, rules: readonly string[]) => boolean =
  untypedLiftsOnlyRules;

export const validateExceptions: (exceptions: unknown, name: string, options: object) => void =
  untypedValidateExceptions;

export const canonicalRule: (rule: string) => string = untypedCanonicalRule;

export const RULES: readonly { readonly id: string }[] = untypedRules;

export const didYouMean: (input: string, candidates: readonly string[]) => string =
  untypedDidYouMean;

export const suggestionOrAllowed: (
  input: string,
  candidates: readonly string[],
  allowedLabel?: string,
) => string = untypedSuggestionOrAllowed;

export const stylingApproaches: readonly string[] = untypedStylingApproaches;

export const i18nRuleIds: readonly string[] = untypedI18nRuleIds;
