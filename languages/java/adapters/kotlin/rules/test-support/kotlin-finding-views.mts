import { exceptionHint as untypedExceptionHint } from '../../../../../../shared/rules/exceptions.mjs';
import {
  applyKotlinRuleMessages as untypedApplyKotlinRuleMessages,
  withKotlinRuleMessage as untypedWithKotlinRuleMessage,
} from '../kotlin-messages.mjs';
import { withAllowedForm as untypedWithAllowedForm } from '../kotlin-rules.mjs';

export type RuleFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string | undefined;
  readonly identity?: string;
  readonly message: string;
  readonly classification: string;
  readonly allowedForm?: string | undefined;
};

export const exceptionHint: (rule: string, file: string) => string = untypedExceptionHint;

export const withKotlinRuleMessage: (finding: RuleFinding) => RuleFinding =
  untypedWithKotlinRuleMessage;

export const applyKotlinRuleMessages: (findings: RuleFinding[]) => RuleFinding[] =
  untypedApplyKotlinRuleMessages;

export const withAllowedForm: (finding: RuleFinding) => RuleFinding = untypedWithAllowedForm;
