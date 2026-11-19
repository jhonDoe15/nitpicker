import { exceptionHint as untypedExceptionHint } from '../../../../../../shared/rules/exceptions.mjs';

export { applyKotlinRuleMessages, withKotlinRuleMessage } from '../kotlin-messages.mts';
export { type RuleFinding, withAllowedForm } from '../kotlin-rules.mts';

export const exceptionHint: (rule: string, file: string) => string = untypedExceptionHint;
