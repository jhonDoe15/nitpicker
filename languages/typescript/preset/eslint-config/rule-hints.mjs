export const EXCEPTION_HINT = 'add an exception for this rule in nitpicker.config.json.';
export const GENERAL_HINT = ` If this is intentional, ${EXCEPTION_HINT}`;
export const SYNTAX_EXCEPTION_HINT =
  ' If a framework or library requires it, add an exception for this rule for those paths in nitpicker.config.json.';

export function withReportFilter(rule, filterFor) {
  return {
    ...rule,
    create: (context) => {
      const filtered = filterFor(context);
      return rule.create(
        Object.create(context, {
          report: {
            value: (descriptor) => {
              const kept = filtered(descriptor);
              if (kept !== undefined) {
                context.report(kept);
              }
            },
          },
        }),
      );
    },
  };
}

export function withHint(rule, hint) {
  const hinted = withReportFilter(rule, () => (descriptor) => hintedDescriptor(descriptor, hint));
  return {
    ...hinted,
    meta: { ...rule.meta, messages: hintedMessages(rule.meta.messages ?? {}, hint) },
  };
}

const closingPunctuation = /[.!?:;]$/u;
const leadingPunctuation = /^[.!?:;]/u;

function withHintText(text, hint) {
  if (leadingPunctuation.test(hint)) {
    return `${text}${hint}`;
  }
  const trimmed = text.trimEnd();
  return closingPunctuation.test(trimmed) ? `${trimmed}${hint}` : `${trimmed}.${hint}`;
}

function hintedMessages(messages, hint) {
  return Object.fromEntries(
    Object.entries(messages).map(([id, text]) => [id, withHintText(text, hint)]),
  );
}

function hintedDescriptor(descriptor, hint) {
  return descriptor.message === undefined
    ? descriptor
    : { ...descriptor, message: withHintText(descriptor.message, hint) };
}

function omit(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
}

export function withoutFixes(rule) {
  const unfixed = withReportFilter(
    rule,
    () => (descriptor) => omit(descriptor, ['fix', 'suggest']),
  );
  return { ...unfixed, meta: omit(rule.meta, ['fixable', 'hasSuggestions']) };
}
