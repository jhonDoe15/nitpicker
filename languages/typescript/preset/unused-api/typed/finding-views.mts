import {
  MESSAGES as UNTYPED_MESSAGES,
  messageFields as untypedMessageFields,
} from '../../../../../shared/policy.mjs';
import { exceptionText as untypedExceptionText } from '../../../../../shared/rules/exceptions.mjs';
import { nextOccurrence as untypedNextOccurrence } from '../../../../../shared/rules/finding-helpers.mjs';
import {
  UNUSED_API_RULE_IDS as UNTYPED_RULE_IDS,
  UNUSED_OPTION_SCOPES as UNTYPED_SCOPES,
} from '../../../../../shared/unused-api/unused-api-policy.mjs';

export const MESSAGES: { readonly unusedProp: unknown; readonly unusedOption: unknown } =
  UNTYPED_MESSAGES;

export const messageFields: (
  template: unknown,
  values: { readonly name: string; readonly scope: string; readonly exception: string },
) => { readonly message: string; readonly allowedForm?: string } = untypedMessageFields;

export const exceptionText: (rule: string, path: string) => string = untypedExceptionText;

export const nextOccurrence: (occurrences: Map<string, number>, key: string) => number =
  untypedNextOccurrence;

export const UNUSED_API_RULE_IDS: { readonly unusedProp: string; readonly unusedOption: string } =
  UNTYPED_RULE_IDS;

export const UNUSED_OPTION_SCOPES: {
  readonly typescript: { readonly private: string; readonly published: string };
} = UNTYPED_SCOPES;
