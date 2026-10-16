export const EXCEPTION_HINT = 'add an exception for this rule in nitpicker.config.json.';
export const GENERAL_HINT = ` If this is intentional, ${EXCEPTION_HINT}`;

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

function hintedMessages(messages, hint) {
  return Object.fromEntries(Object.entries(messages).map(([id, text]) => [id, `${text}${hint}`]));
}

function hintedDescriptor(descriptor, hint) {
  return descriptor.message === undefined
    ? descriptor
    : { ...descriptor, message: `${descriptor.message}${hint}` };
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
