export const SYNTAX_EXCEPTION_HINT =
  ' If a framework or library requires it, add an exception for `no-restricted-syntax` for those paths in nitpicker.config.json.';

export function withHint(rule, hint) {
  return {
    ...rule,
    meta: { ...rule.meta, messages: hintedMessages(rule.meta.messages ?? {}, hint) },
    create: (context) => rule.create(hintedContext(context, hint)),
  };
}

function hintedMessages(messages, hint) {
  return Object.fromEntries(Object.entries(messages).map(([id, text]) => [id, `${text}${hint}`]));
}

function hintedContext(context, hint) {
  return Object.create(context, {
    report: { value: (descriptor) => context.report(hintedDescriptor(descriptor, hint)) },
  });
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
  return {
    ...rule,
    meta: omit(rule.meta, ['fixable', 'hasSuggestions']),
    create: (context) =>
      rule.create(
        Object.create(context, {
          report: { value: (descriptor) => context.report(omit(descriptor, ['fix', 'suggest'])) },
        }),
      ),
  };
}
