import { exceptionHint as untypedExceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { KOTLIN_SOURCE_RULES } from '../scan/kotlin-scan.mts';
import { EFFECTS_RULES } from '../../effects/effects-messages.mts';
import {
  appendSentence as untypedAppendSentence,
  hasExceptionRoute as untypedHasExceptionRoute,
} from '../../../../../shared/messages/exception-sentence.mjs';
import { type RuleFinding, withAllowedForm } from './kotlin-rules.mts';

const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;
const appendSentence: (message: string, sentence: string) => string = untypedAppendSentence;
const hasExceptionRoute: (message: string) => boolean = untypedHasExceptionRoute;

export const DETEKT_RULE = /^detekt\.[a-z-]+\.[A-Z][A-Za-z0-9]*$/;
const KOTLINC_RULES = [
  'kotlinc/deprecation',
  'kotlinc/unchecked',
  'kotlinc/cast',
  'kotlinc/lint-not-run',
];
const KOTLIN_CLASS_LIMIT_RULES = [
  'class-methods-limit',
  'class-fields-limit',
  'inheritance-depth-limit',
];
export const KOTLIN_LISTED_RULES = [
  ...KOTLIN_SOURCE_RULES,
  ...EFFECTS_RULES,
  ...KOTLINC_RULES,
  ...KOTLIN_CLASS_LIMIT_RULES,
];
const LISTED_RULES = new Set(KOTLIN_LISTED_RULES);

export function isKotlinFindingRule(rule: string): boolean {
  return DETEKT_RULE.test(rule) || LISTED_RULES.has(rule);
}

function exceptionRuleOf(finding: RuleFinding): string {
  const printed = `${finding.tool}/${finding.rule}`;
  return LISTED_RULES.has(printed) ? printed : finding.rule;
}

function liftable(finding: RuleFinding): finding is RuleFinding & { readonly path: string } {
  return (
    finding.classification === 'enforceable' &&
    typeof finding.path === 'string' &&
    isKotlinFindingRule(exceptionRuleOf(finding)) &&
    !hasExceptionRoute(finding.message)
  );
}

export function withKotlinRuleMessage(finding: RuleFinding): RuleFinding {
  const shaped = withAllowedForm(finding);
  if (!liftable(shaped)) {
    return shaped;
  }
  return {
    ...shaped,
    message: appendSentence(shaped.message, exceptionHint(exceptionRuleOf(shaped), shaped.path)),
  };
}

export function applyKotlinRuleMessages(findings: readonly RuleFinding[]): RuleFinding[] {
  return findings.map(withKotlinRuleMessage);
}
