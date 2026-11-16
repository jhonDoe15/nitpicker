import type { Rule } from 'eslint';

export type ReportFilter = (
  context: Rule.RuleContext,
) => (descriptor: Rule.ReportDescriptor) => Rule.ReportDescriptor | undefined;

export const SYNTAX_EXCEPTION_HINT =
  ' An exception fits only when a framework or library requires it.';

function isRuleContext(value: unknown): value is Rule.RuleContext {
  return typeof value === 'object' && value !== null && 'report' in value;
}

function reportingContext(
  context: Rule.RuleContext,
  report: (descriptor: Rule.ReportDescriptor) => void,
): Rule.RuleContext {
  const derived: unknown = Object.create(context, { report: { value: report } });
  if (!isRuleContext(derived)) {
    throw new TypeError('The rule context could not be wrapped.');
  }
  return derived;
}

export function withReportFilter(rule: Rule.RuleModule, filterFor: ReportFilter): Rule.RuleModule {
  return {
    ...rule,
    create(context) {
      const filtered = filterFor(context);
      return rule.create(
        reportingContext(context, (descriptor) => {
          const kept = filtered(descriptor);
          if (kept !== undefined) {
            context.report(kept);
          }
        }),
      );
    },
  };
}

export function withHint(rule: Rule.RuleModule, hint: string): Rule.RuleModule {
  const hinted = withReportFilter(rule, () => (descriptor) => hintedDescriptor(descriptor, hint));
  return {
    ...hinted,
    meta: { ...rule.meta, messages: hintedMessages(rule.meta?.messages ?? {}, hint) },
  };
}

const closingPunctuation = /[.!?:;]$/u;
const leadingPunctuation = /^[.!?:;]/u;

function withHintText(text: string, hint: string): string {
  if (leadingPunctuation.test(hint)) {
    return `${text}${hint}`;
  }
  const trimmed = text.trimEnd();
  return closingPunctuation.test(trimmed) ? `${trimmed}${hint}` : `${trimmed}.${hint}`;
}

function hintedMessages(
  messages: Readonly<Record<string, string>>,
  hint: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).map(([id, text]) => [id, withHintText(text, hint)]),
  );
}

function hintedDescriptor(descriptor: Rule.ReportDescriptor, hint: string): Rule.ReportDescriptor {
  return 'message' in descriptor && typeof descriptor.message === 'string'
    ? { ...descriptor, message: withHintText(descriptor.message, hint) }
    : descriptor;
}

function omit<Value extends object>(object: Value, keys: readonly string[]): Value {
  const copy = { ...object };
  for (const key of keys) {
    Reflect.deleteProperty(copy, key);
  }
  return copy;
}

export function withoutFixes(rule: Rule.RuleModule): Rule.RuleModule {
  const unfixed = withReportFilter(
    rule,
    () => (descriptor) => omit(descriptor, ['fix', 'suggest']),
  );
  return { ...unfixed, meta: omit(rule.meta ?? {}, ['fixable', 'hasSuggestions']) };
}
