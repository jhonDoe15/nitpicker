import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { KOTLIN_SOURCE_RULES } from '../scan/kotlin-scan.mjs';
import { appendSentence, withAllowedForm } from './kotlin-rules.mjs';

const CONFIG_FILE = 'nitpicker.config.json';
const DETEKT_RULE = /^detekt\.[a-z-]+\.[A-Z][A-Za-z0-9]*$/;
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
  ...KOTLINC_RULES,
  ...KOTLIN_CLASS_LIMIT_RULES,
];
const LISTED_RULES = new Set(KOTLIN_LISTED_RULES);

export function isKotlinFindingRule(rule) {
  return DETEKT_RULE.test(rule) || LISTED_RULES.has(rule);
}

function exceptionRuleOf(finding) {
  const printed = `${finding.tool}/${finding.rule}`;
  return LISTED_RULES.has(printed) ? printed : finding.rule;
}

function liftable(finding) {
  return (
    finding.classification === 'enforceable' &&
    isKotlinFindingRule(exceptionRuleOf(finding)) &&
    !finding.message.includes(CONFIG_FILE)
  );
}

export function withKotlinRuleMessage(finding) {
  const shaped = withAllowedForm(finding);
  if (!liftable(shaped)) {
    return shaped;
  }
  return {
    ...shaped,
    message: appendSentence(shaped.message, exceptionHint(exceptionRuleOf(shaped), shaped.path)),
  };
}

export function applyKotlinRuleMessages(findings) {
  return findings.map(withKotlinRuleMessage);
}
